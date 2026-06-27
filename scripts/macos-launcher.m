#import <Cocoa/Cocoa.h>
#import <arpa/inet.h>
#import <errno.h>
#import <fcntl.h>
#import <netinet/in.h>
#import <spawn.h>
#import <signal.h>
#import <sys/socket.h>
#import <sys/wait.h>
#import <unistd.h>

extern char **environ;

static NSString *TrainTimerStateDirectory(void) {
  return [NSHomeDirectory() stringByAppendingPathComponent:@".train-timer"];
}

static void TrainTimerEnsureStateDirectory(void) {
  [[NSFileManager defaultManager] createDirectoryAtPath:TrainTimerStateDirectory()
                            withIntermediateDirectories:YES
                                             attributes:nil
                                                  error:nil];
}

static NSString *TrainTimerBundledRuntimeDirectory(void) {
  return [[[NSBundle mainBundle] resourcePath] stringByAppendingPathComponent:@"runtime"];
}

static BOOL TrainTimerPrepareRuntime(NSString *projectRoot, NSString **runtimeRootOut, NSString **errorOut) {
  (void)projectRoot;
  NSFileManager *fileManager = [NSFileManager defaultManager];
  NSString *runtimeRoot = TrainTimerBundledRuntimeDirectory();
  NSString *serverPath = [runtimeRoot stringByAppendingPathComponent:@"src/server.js"];
  NSString *packagePath = [runtimeRoot stringByAppendingPathComponent:@"package.json"];
  NSString *publicPath = [runtimeRoot stringByAppendingPathComponent:@"public"];

  BOOL isDirectory = NO;
  if (![fileManager fileExistsAtPath:serverPath isDirectory:&isDirectory] || isDirectory) {
    if (errorOut) *errorOut = [NSString stringWithFormat:@"找不到服务入口：%@", serverPath];
    return NO;
  }
  if (![fileManager fileExistsAtPath:packagePath isDirectory:&isDirectory] || isDirectory) {
    if (errorOut) *errorOut = [NSString stringWithFormat:@"找不到 package.json：%@", packagePath];
    return NO;
  }
  if (![fileManager fileExistsAtPath:publicPath isDirectory:&isDirectory] || !isDirectory) {
    if (errorOut) *errorOut = [NSString stringWithFormat:@"找不到 public 目录：%@", publicPath];
    return NO;
  }

  if (runtimeRootOut) *runtimeRootOut = runtimeRoot;
  return YES;
}

static void TrainTimerAppendLog(NSString *message) {
  TrainTimerEnsureStateDirectory();
  NSString *logPath = [TrainTimerStateDirectory() stringByAppendingPathComponent:@"app-wrapper.log"];
  NSString *timestamp = [[NSDate date] descriptionWithLocale:nil];
  NSString *line = [NSString stringWithFormat:@"[%@] %@\n", timestamp, message];
  NSData *data = [line dataUsingEncoding:NSUTF8StringEncoding];

  if (![[NSFileManager defaultManager] fileExistsAtPath:logPath]) {
    [[NSFileManager defaultManager] createFileAtPath:logPath contents:nil attributes:nil];
  }

  NSFileHandle *handle = [NSFileHandle fileHandleForWritingAtPath:logPath];
  if (!handle) return;
  @try {
    [handle seekToEndOfFile];
    [handle writeData:data];
  } @catch (__unused NSException *exception) {
  }
  [handle closeFile];
}

static NSString *TrainTimerTrim(NSString *text) {
  return [text stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
}

static NSInteger TrainTimerPortInteger(NSString *port, NSInteger fallback) {
  NSInteger value = port.integerValue;
  return value > 0 && value < 65536 ? value : fallback;
}

static NSInteger TrainTimerManagedPortCount(void) {
  NSString *value = [[NSProcessInfo processInfo] environment][@"TRAIN_TIMER_PORT_COUNT"];
  NSInteger count = value.length > 0 ? value.integerValue : 30;
  return count > 0 && count <= 200 ? count : 30;
}

static NSInteger TrainTimerManagedPortEnd(NSInteger basePort) {
  return MIN((NSInteger)65535, basePort + TrainTimerManagedPortCount() - 1);
}

static NSString *TrainTimerURLString(NSString *host, NSInteger port) {
  return [NSString stringWithFormat:@"http://%@:%ld", host ?: @"127.0.0.1", (long)port];
}

static NSInteger TrainTimerURLPort(NSString *url, NSInteger fallback) {
  NSURLComponents *components = [NSURLComponents componentsWithString:url];
  return TrainTimerPortInteger(components.port.stringValue, fallback);
}

static NSString *TrainTimerPortRangeLabel(NSString *basePort) {
  NSInteger base = TrainTimerPortInteger(basePort, 3211);
  return [NSString stringWithFormat:@"%ld-%ld", (long)base, (long)TrainTimerManagedPortEnd(base)];
}

static void TrainTimerAddPath(NSMutableArray<NSString *> *paths, NSString *path) {
  if (path.length == 0) return;
  if (![paths containsObject:path] && [[NSFileManager defaultManager] isExecutableFileAtPath:path]) {
    [paths addObject:path];
  }
}

static NSArray<NSString *> *TrainTimerNodeCandidates(void) {
  NSMutableArray<NSString *> *paths = [NSMutableArray array];
  NSString *home = NSHomeDirectory();

  TrainTimerAddPath(paths, @"/opt/homebrew/bin/node");
  TrainTimerAddPath(paths, @"/usr/local/bin/node");
  TrainTimerAddPath(paths, [home stringByAppendingPathComponent:@".volta/bin/node"]);
  TrainTimerAddPath(paths, @"/usr/bin/node");

  NSString *nvmRoot = [home stringByAppendingPathComponent:@".nvm/versions/node"];
  NSArray<NSString *> *versions = [[NSFileManager defaultManager] contentsOfDirectoryAtPath:nvmRoot error:nil];
  versions = [versions sortedArrayUsingSelector:@selector(localizedStandardCompare:)];
  for (NSString *version in [versions reverseObjectEnumerator]) {
    TrainTimerAddPath(paths, [[nvmRoot stringByAppendingPathComponent:version] stringByAppendingPathComponent:@"bin/node"]);
  }

  return paths;
}

static NSString *TrainTimerFindNode(void) {
  for (NSString *path in TrainTimerNodeCandidates()) {
    return path;
  }
  return nil;
}

static NSString *TrainTimerRuntimePath(NSString *nodePath) {
  NSMutableArray<NSString *> *paths = [NSMutableArray array];
  void (^add)(NSString *) = ^(NSString *path) {
    if (path.length > 0 && ![paths containsObject:path]) {
      [paths addObject:path];
    }
  };

  add([nodePath stringByDeletingLastPathComponent]);
  add(@"/opt/homebrew/bin");
  add(@"/usr/local/bin");
  add([NSHomeDirectory() stringByAppendingPathComponent:@".volta/bin"]);
  add(@"/usr/bin");
  add(@"/bin");
  add(@"/usr/sbin");
  add(@"/sbin");
  return [paths componentsJoinedByString:@":"];
}

static NSString *TrainTimerRunCommandOutput(NSString *launchPath, NSArray<NSString *> *arguments, NSTimeInterval timeoutSeconds, int *statusOut) {
  if (![[NSFileManager defaultManager] isExecutableFileAtPath:launchPath]) {
    if (statusOut) *statusOut = 127;
    return @"";
  }

  NSTask *task = [[NSTask alloc] init];
  NSPipe *stdoutPipe = [NSPipe pipe];
  NSPipe *stderrPipe = [NSPipe pipe];
  task.launchPath = launchPath;
  task.arguments = arguments ?: @[];
  task.standardOutput = stdoutPipe;
  task.standardError = stderrPipe;
  task.standardInput = [NSFileHandle fileHandleForReadingAtPath:@"/dev/null"];

  @try {
    [task launch];
  } @catch (__unused NSException *exception) {
    if (statusOut) *statusOut = 126;
    return @"";
  }

  NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:timeoutSeconds];
  while (task.isRunning && [deadline timeIntervalSinceNow] > 0) {
    [NSThread sleepForTimeInterval:0.05];
  }

  if (task.isRunning) {
    [task terminate];
    NSDate *killDeadline = [NSDate dateWithTimeIntervalSinceNow:0.5];
    while (task.isRunning && [killDeadline timeIntervalSinceNow] > 0) {
      [NSThread sleepForTimeInterval:0.05];
    }
    if (task.isRunning) kill(task.processIdentifier, SIGKILL);
  }

  NSData *data = [[stdoutPipe fileHandleForReading] readDataToEndOfFile];
  if (statusOut) *statusOut = task.terminationStatus;
  return [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] ?: @"";
}

static int TrainTimerRunCommandStatus(NSString *launchPath, NSArray<NSString *> *arguments, NSTimeInterval timeoutSeconds) {
  int status = 1;
  TrainTimerRunCommandOutput(launchPath, arguments, timeoutSeconds, &status);
  return status;
}

static BOOL TrainTimerPortAcceptsConnections(NSString *host, NSInteger port) {
  int descriptor = socket(AF_INET, SOCK_STREAM, 0);
  if (descriptor < 0) return NO;

  struct timeval timeout;
  timeout.tv_sec = 0;
  timeout.tv_usec = 150000;
  setsockopt(descriptor, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
  setsockopt(descriptor, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout));

  struct sockaddr_in address;
  memset(&address, 0, sizeof(address));
  address.sin_family = AF_INET;
  address.sin_port = htons((uint16_t)port);
  if (inet_pton(AF_INET, (host ?: @"127.0.0.1").UTF8String, &address.sin_addr) != 1) {
    close(descriptor);
    return NO;
  }

  BOOL open = connect(descriptor, (struct sockaddr *)&address, sizeof(address)) == 0;
  close(descriptor);
  return open;
}

static NSArray<NSNumber *> *TrainTimerListeningPidsForPort(NSInteger port) {
  NSString *portArgument = [NSString stringWithFormat:@"-iTCP:%ld", (long)port];
  int status = 0;
  NSString *output = TrainTimerRunCommandOutput(@"/usr/sbin/lsof",
                                                @[@"-nP", @"-t", portArgument, @"-sTCP:LISTEN"],
                                                2.0,
                                                &status);
  if (status != 0 && output.length == 0) return @[];

  NSMutableArray<NSNumber *> *pids = [NSMutableArray array];
  for (NSString *line in [output componentsSeparatedByCharactersInSet:[NSCharacterSet newlineCharacterSet]]) {
    NSString *trimmed = TrainTimerTrim(line);
    pid_t pid = (pid_t)trimmed.intValue;
    if (pid > 0) [pids addObject:@(pid)];
  }
  return pids;
}

static BOOL TrainTimerHealthCheck(NSString *baseURL) {
  NSURLComponents *components = [NSURLComponents componentsWithString:baseURL];
  NSString *host = components.host ?: @"127.0.0.1";
  NSNumber *portNumber = components.port ?: @3211;
  int port = portNumber.intValue;

  int descriptor = socket(AF_INET, SOCK_STREAM, 0);
  if (descriptor < 0) return NO;

  struct timeval timeout;
  timeout.tv_sec = 0;
  timeout.tv_usec = 200000;
  setsockopt(descriptor, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
  setsockopt(descriptor, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout));

  struct sockaddr_in address;
  memset(&address, 0, sizeof(address));
  address.sin_family = AF_INET;
  address.sin_port = htons((uint16_t)port);
  if (inet_pton(AF_INET, host.UTF8String, &address.sin_addr) != 1) {
    close(descriptor);
    return NO;
  }

  if (connect(descriptor, (struct sockaddr *)&address, sizeof(address)) != 0) {
    close(descriptor);
    return NO;
  }

  NSString *request = [NSString stringWithFormat:@"GET /api/health HTTP/1.1\r\nHost: %@:%d\r\nConnection: close\r\n\r\n", host, port];
  NSData *requestData = [request dataUsingEncoding:NSUTF8StringEncoding];
  ssize_t sent = send(descriptor, requestData.bytes, requestData.length, 0);
  if (sent <= 0) {
    close(descriptor);
    return NO;
  }

  NSMutableData *response = [NSMutableData data];
  char buffer[1024];
  while (response.length < 8192) {
    ssize_t received = recv(descriptor, buffer, sizeof(buffer), 0);
    if (received <= 0) break;
    [response appendBytes:buffer length:(NSUInteger)received];
  }
  close(descriptor);

  if (response.length == 0) return NO;
  NSString *body = [[NSString alloc] initWithData:response encoding:NSUTF8StringEncoding];
  return [body containsString:@"\"app\":\"TrainTimer\""];
}

static char **TrainTimerCreateEnvironment(NSString *nodePath, NSString *host, NSString *port) {
  NSMutableDictionary<NSString *, NSString *> *environment = [[[NSProcessInfo processInfo] environment] mutableCopy];
  environment[@"HOME"] = NSHomeDirectory();
  environment[@"HOST"] = host;
  environment[@"PORT"] = port;
  environment[@"PATH"] = TrainTimerRuntimePath(nodePath);

  NSArray<NSString *> *keys = environment.allKeys;
  char **envp = calloc(keys.count + 1, sizeof(char *));
  for (NSUInteger index = 0; index < keys.count; index++) {
    NSString *key = keys[index];
    NSString *value = environment[key] ?: @"";
    NSString *entry = [NSString stringWithFormat:@"%@=%@", key, value];
    envp[index] = strdup(entry.UTF8String);
  }
  envp[keys.count] = NULL;
  return envp;
}

static void TrainTimerFreeCStringArray(char **items) {
  if (!items) return;
  for (NSUInteger index = 0; items[index] != NULL; index++) {
    free(items[index]);
  }
  free(items);
}

static int TrainTimerSpawnServer(NSString *nodePath,
                                 NSString *projectRoot,
                                 NSString *host,
                                 NSString *port,
                                 pid_t *pidOut,
                                 NSString **errorOut) {
  TrainTimerEnsureStateDirectory();
  NSString *logPath = [TrainTimerStateDirectory() stringByAppendingPathComponent:@"launcher.log"];
  NSString *serverPath = [projectRoot stringByAppendingPathComponent:@"src/server.js"];
  const char *node = nodePath.UTF8String;
  const char *server = serverPath.UTF8String;
  const char *log = logPath.UTF8String;

  posix_spawn_file_actions_t actions;
  posix_spawn_file_actions_init(&actions);
  posix_spawn_file_actions_addopen(&actions, STDIN_FILENO, "/dev/null", O_RDONLY, 0);
  posix_spawn_file_actions_addopen(&actions, STDOUT_FILENO, log, O_WRONLY | O_CREAT | O_APPEND, 0644);
  posix_spawn_file_actions_addopen(&actions, STDERR_FILENO, log, O_WRONLY | O_CREAT | O_APPEND, 0644);

  char *argv[] = {(char *)node, (char *)server, NULL};
  char **envp = TrainTimerCreateEnvironment(nodePath, host, port);
  pid_t pid = 0;
  int result = posix_spawn(&pid, node, &actions, NULL, argv, envp);

  posix_spawn_file_actions_destroy(&actions);
  TrainTimerFreeCStringArray(envp);

  if (result != 0) {
    if (errorOut) {
      *errorOut = [NSString stringWithFormat:@"posix_spawn failed: %d", result];
    }
    return result;
  }

  if (pidOut) *pidOut = pid;
  return 0;
}

static BOOL TrainTimerPidIsRunning(pid_t pid) {
  return pid > 0 && kill(pid, 0) == 0;
}

static BOOL TrainTimerPidHasExited(pid_t pid) {
  if (pid <= 0) return YES;
  int status = 0;
  pid_t result = waitpid(pid, &status, WNOHANG);
  return result == pid;
}

static void TrainTimerTerminatePid(pid_t pid, NSTimeInterval graceSeconds) {
  if (!TrainTimerPidIsRunning(pid)) return;
  kill(pid, SIGTERM);

  NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:graceSeconds];
  while (TrainTimerPidIsRunning(pid) && [deadline timeIntervalSinceNow] > 0) {
    int status = 0;
    if (waitpid(pid, &status, WNOHANG) == pid) return;
    [NSThread sleepForTimeInterval:0.05];
  }

  if (TrainTimerPidIsRunning(pid)) {
    kill(pid, SIGKILL);
    waitpid(pid, NULL, 0);
  }
}

static NSString *TrainTimerFindHealthyServiceURL(NSString *host, NSInteger basePort, NSInteger endPort) {
  for (NSInteger port = basePort; port <= endPort; port++) {
    NSString *url = TrainTimerURLString(host, port);
    if (TrainTimerHealthCheck(url)) return url;
  }
  return nil;
}

static NSUInteger TrainTimerTerminateHealthyProjectServers(NSString *host, NSInteger basePort, NSInteger endPort) {
  NSMutableSet<NSNumber *> *pids = [NSMutableSet set];
  for (NSInteger port = basePort; port <= endPort; port++) {
    NSString *url = TrainTimerURLString(host, port);
    if (!TrainTimerHealthCheck(url)) continue;
    for (NSNumber *pid in TrainTimerListeningPidsForPort(port)) {
      [pids addObject:pid];
    }
  }

  for (NSNumber *pid in pids) {
    TrainTimerAppendLog([NSString stringWithFormat:@"Stopping TrainTimer server pid=%@", pid]);
    TrainTimerTerminatePid((pid_t)pid.intValue, 1.5);
  }
  return pids.count;
}

static NSInteger TrainTimerFirstAvailablePort(NSString *host, NSInteger basePort, NSInteger endPort) {
  for (NSInteger port = basePort; port <= endPort; port++) {
    if (!TrainTimerPortAcceptsConnections(host, port)) return port;
  }
  return 0;
}

static NSURL *TrainTimerChromeApplicationURL(void) {
  return [[NSWorkspace sharedWorkspace] URLForApplicationWithBundleIdentifier:@"com.google.Chrome"];
}

static BOOL TrainTimerOpenURLPreferChrome(NSURL *url) {
  if (!url) return NO;
  NSURL *chromeURL = TrainTimerChromeApplicationURL();
  if (chromeURL) {
    if (@available(macOS 10.15, *)) {
      NSWorkspaceOpenConfiguration *configuration = [NSWorkspaceOpenConfiguration configuration];
      configuration.activates = YES;
      [[NSWorkspace sharedWorkspace] openURLs:@[url]
                         withApplicationAtURL:chromeURL
                                configuration:configuration
                            completionHandler:^(NSRunningApplication *app, NSError *error) {
        if (error) {
          TrainTimerAppendLog([NSString stringWithFormat:@"Chrome open failed: %@", error.localizedDescription]);
        }
      }];
      return YES;
    }
  }
  return [[NSWorkspace sharedWorkspace] openURL:url];
}

static void TrainTimerPrewarmChrome(void) {
  NSURL *chromeURL = TrainTimerChromeApplicationURL();
  if (!chromeURL) return;
  if (@available(macOS 10.15, *)) {
    NSWorkspaceOpenConfiguration *configuration = [NSWorkspaceOpenConfiguration configuration];
    configuration.activates = NO;
    [[NSWorkspace sharedWorkspace] openApplicationAtURL:chromeURL
                                         configuration:configuration
                                     completionHandler:^(NSRunningApplication *app, NSError *error) {
      if (error) {
        TrainTimerAppendLog([NSString stringWithFormat:@"Chrome prewarm failed: %@", error.localizedDescription]);
      }
    }];
  }
}

static NSString *TrainTimerLaunchAgentLabel(void) {
  return @"local.traintimer.web";
}

static NSString *TrainTimerLaunchAgentDirectory(void) {
  return [NSHomeDirectory() stringByAppendingPathComponent:@"Library/LaunchAgents"];
}

static NSString *TrainTimerLaunchAgentPath(void) {
  return [TrainTimerLaunchAgentDirectory() stringByAppendingPathComponent:[TrainTimerLaunchAgentLabel() stringByAppendingString:@".plist"]];
}

static NSString *TrainTimerLaunchDomain(void) {
  return [NSString stringWithFormat:@"gui/%d", getuid()];
}

static NSString *TrainTimerLaunchServiceName(void) {
  return [NSString stringWithFormat:@"%@/%@", TrainTimerLaunchDomain(), TrainTimerLaunchAgentLabel()];
}

static NSString *TrainTimerXmlEscape(NSString *text) {
  NSMutableString *escaped = [text mutableCopy];
  [escaped replaceOccurrencesOfString:@"&" withString:@"&amp;" options:0 range:NSMakeRange(0, escaped.length)];
  [escaped replaceOccurrencesOfString:@"<" withString:@"&lt;" options:0 range:NSMakeRange(0, escaped.length)];
  [escaped replaceOccurrencesOfString:@">" withString:@"&gt;" options:0 range:NSMakeRange(0, escaped.length)];
  [escaped replaceOccurrencesOfString:@"\"" withString:@"&quot;" options:0 range:NSMakeRange(0, escaped.length)];
  return escaped;
}

static BOOL TrainTimerWriteLaunchAgent(NSString *nodePath, NSString *projectRoot, NSString *host, NSString *port) {
  TrainTimerEnsureStateDirectory();
  [[NSFileManager defaultManager] createDirectoryAtPath:TrainTimerLaunchAgentDirectory()
                            withIntermediateDirectories:YES
                                             attributes:nil
                                                  error:nil];

  NSString *serverPath = [projectRoot stringByAppendingPathComponent:@"src/server.js"];
  NSString *logPath = [TrainTimerStateDirectory() stringByAppendingPathComponent:@"launcher.log"];
  NSString *plist = [NSString stringWithFormat:
    @"<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
     "<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n"
     "<plist version=\"1.0\"><dict>\n"
     "<key>Label</key><string>%@</string>\n"
     "<key>ProgramArguments</key><array><string>%@</string><string>%@</string></array>\n"
     "<key>WorkingDirectory</key><string>%@</string>\n"
     "<key>EnvironmentVariables</key><dict>\n"
     "<key>HOME</key><string>%@</string>\n"
     "<key>HOST</key><string>%@</string>\n"
     "<key>PORT</key><string>%@</string>\n"
     "<key>PATH</key><string>%@</string>\n"
     "</dict>\n"
     "<key>RunAtLoad</key><true/>\n"
     "<key>KeepAlive</key><false/>\n"
     "<key>StandardOutPath</key><string>%@</string>\n"
     "<key>StandardErrorPath</key><string>%@</string>\n"
     "</dict></plist>\n",
    TrainTimerXmlEscape(TrainTimerLaunchAgentLabel()),
    TrainTimerXmlEscape(nodePath),
    TrainTimerXmlEscape(serverPath),
    TrainTimerXmlEscape(projectRoot),
    TrainTimerXmlEscape(NSHomeDirectory()),
    TrainTimerXmlEscape(host),
    TrainTimerXmlEscape(port),
    TrainTimerXmlEscape(TrainTimerRuntimePath(nodePath)),
    TrainTimerXmlEscape(logPath),
    TrainTimerXmlEscape(logPath)];

  return [plist writeToFile:TrainTimerLaunchAgentPath()
                 atomically:YES
                   encoding:NSUTF8StringEncoding
                      error:nil];
}

static int TrainTimerRunLaunchctl(NSArray<NSString *> *arguments, NSTimeInterval timeoutSeconds) {
  NSString *logPath = [TrainTimerStateDirectory() stringByAppendingPathComponent:@"app-wrapper.log"];

  posix_spawn_file_actions_t actions;
  posix_spawn_file_actions_init(&actions);
  posix_spawn_file_actions_addopen(&actions, STDIN_FILENO, "/dev/null", O_RDONLY, 0);
  posix_spawn_file_actions_addopen(&actions, STDOUT_FILENO, logPath.UTF8String, O_WRONLY | O_CREAT | O_APPEND, 0644);
  posix_spawn_file_actions_addopen(&actions, STDERR_FILENO, logPath.UTF8String, O_WRONLY | O_CREAT | O_APPEND, 0644);

  NSUInteger argc = arguments.count + 2;
  char **argv = calloc(argc, sizeof(char *));
  argv[0] = strdup("/bin/launchctl");
  for (NSUInteger index = 0; index < arguments.count; index++) {
    argv[index + 1] = strdup(arguments[index].UTF8String);
  }
  argv[argc - 1] = NULL;

  pid_t pid = 0;
  int result = posix_spawn(&pid, "/bin/launchctl", &actions, NULL, argv, environ);
  posix_spawn_file_actions_destroy(&actions);
  TrainTimerFreeCStringArray(argv);
  if (result != 0) return result;

  NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:timeoutSeconds];
  int status = 0;
  while ([deadline timeIntervalSinceNow] > 0) {
    pid_t waitResult = waitpid(pid, &status, WNOHANG);
    if (waitResult == pid) {
      return WIFEXITED(status) ? WEXITSTATUS(status) : 1;
    }
    [NSThread sleepForTimeInterval:0.05];
  }

  kill(pid, SIGKILL);
  waitpid(pid, NULL, 0);
  return 124;
}

static void TrainTimerStopLaunchAgent(BOOL removePlist) {
  NSString *plistPath = TrainTimerLaunchAgentPath();
  if ([[NSFileManager defaultManager] fileExistsAtPath:plistPath]) {
    TrainTimerRunLaunchctl(@[@"bootout", TrainTimerLaunchDomain(), plistPath], 5.0);
  }
  TrainTimerRunLaunchctl(@[@"bootout", TrainTimerLaunchServiceName()], 5.0);
  if (removePlist) {
    [[NSFileManager defaultManager] removeItemAtPath:plistPath error:nil];
  }
}

static BOOL TrainTimerStartLaunchAgent(NSString *nodePath, NSString *projectRoot, NSString *host, NSString *port) {
  if (!TrainTimerWriteLaunchAgent(nodePath, projectRoot, host, port)) {
    TrainTimerAppendLog(@"Could not write LaunchAgent plist");
    return NO;
  }

  NSString *plistPath = TrainTimerLaunchAgentPath();
  TrainTimerStopLaunchAgent(NO);
  int bootstrap = TrainTimerRunLaunchctl(@[@"bootstrap", TrainTimerLaunchDomain(), plistPath], 8.0);
  if (bootstrap != 0) {
    TrainTimerAppendLog([NSString stringWithFormat:@"launchctl bootstrap failed: %d", bootstrap]);
    return NO;
  }
  TrainTimerRunLaunchctl(@[@"kickstart", @"-k", TrainTimerLaunchServiceName()], 5.0);
  return YES;
}

@interface TrainTimerAppDelegate : NSObject <NSApplicationDelegate>
@property(nonatomic, copy) NSString *projectRoot;
@property(nonatomic, copy) NSString *nodePath;
@property(nonatomic, copy) NSString *host;
@property(nonatomic, copy) NSString *basePort;
@property(nonatomic, copy) NSString *port;
@property(nonatomic, copy) NSString *currentURL;
@property(nonatomic, assign) pid_t serverPid;
@property(nonatomic, strong) NSWindow *window;
@property(nonatomic, strong) NSTextField *statusField;
@property(nonatomic, strong) NSTextField *urlField;
@property(nonatomic, strong) NSTextField *messageField;
@property(nonatomic, strong) NSTextField *logField;
@property(nonatomic, strong) NSButton *startButton;
@property(nonatomic, strong) NSButton *openButton;
@property(nonatomic, strong) NSButton *stopButton;
@property(nonatomic, strong) NSButton *restartButton;
@property(nonatomic, strong) NSButton *refreshButton;
@property(nonatomic, assign) BOOL running;
@property(nonatomic, assign) BOOL busy;
@end

@implementation TrainTimerAppDelegate

- (instancetype)initWithProjectRoot:(NSString *)projectRoot {
  self = [super init];
  if (!self) return nil;
  _projectRoot = [projectRoot copy];
  _nodePath = [TrainTimerFindNode() copy];
  _host = @"127.0.0.1";
  NSString *configuredPort = [[NSProcessInfo processInfo] environment][@"PORT"] ?: @"3211";
  _basePort = [configuredPort copy];
  _port = [_basePort copy];
  _currentURL = [TrainTimerURLString(_host, TrainTimerPortInteger(_port, 3211)) copy];
  return self;
}

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
  [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
  [self buildMenu];
  [self buildWindow];
  [self.window makeKeyAndOrderFront:nil];
  [NSApp activateIgnoringOtherApps:YES];

  [self startService:nil];
  [NSTimer scheduledTimerWithTimeInterval:5.0
                                   target:self
                                 selector:@selector(refreshStatus:)
                                 userInfo:nil
                                  repeats:YES];
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {
  return YES;
}

- (void)applicationWillTerminate:(NSNotification *)notification {
  if (self.running) {
    TrainTimerAppendLog(@"Window is closing; stopping TrainTimer service");
    if (self.serverPid > 0) {
      TrainTimerTerminatePid(self.serverPid, 1.5);
      self.serverPid = 0;
    }
    NSInteger basePort = TrainTimerPortInteger(self.basePort, 3211);
    TrainTimerTerminateHealthyProjectServers(self.host, basePort, TrainTimerManagedPortEnd(basePort));
    TrainTimerStopLaunchAgent(YES);
  }
}

- (void)closeWindow:(id)sender {
  [self.window performClose:sender];
}

- (void)buildMenu {
  NSString *appName = @"TrainTimer";
  NSMenu *mainMenu = [[NSMenu alloc] initWithTitle:@""];

  NSMenuItem *appMenuItem = [[NSMenuItem alloc] initWithTitle:@"" action:nil keyEquivalent:@""];
  [mainMenu addItem:appMenuItem];

  NSMenu *appMenu = [[NSMenu alloc] initWithTitle:appName];
  NSMenuItem *hideItem = [[NSMenuItem alloc] initWithTitle:[NSString stringWithFormat:@"隐藏 %@", appName]
                                                    action:@selector(hide:)
                                             keyEquivalent:@"h"];
  hideItem.target = NSApp;
  hideItem.keyEquivalentModifierMask = NSEventModifierFlagCommand;
  [appMenu addItem:hideItem];

  NSMenuItem *hideOthersItem = [[NSMenuItem alloc] initWithTitle:@"隐藏其他"
                                                          action:@selector(hideOtherApplications:)
                                                   keyEquivalent:@"h"];
  hideOthersItem.target = NSApp;
  hideOthersItem.keyEquivalentModifierMask = NSEventModifierFlagCommand | NSEventModifierFlagOption;
  [appMenu addItem:hideOthersItem];

  NSMenuItem *showAllItem = [[NSMenuItem alloc] initWithTitle:@"全部显示"
                                                       action:@selector(unhideAllApplications:)
                                                keyEquivalent:@""];
  showAllItem.target = NSApp;
  [appMenu addItem:showAllItem];
  [appMenu addItem:[NSMenuItem separatorItem]];

  NSMenuItem *quitItem = [[NSMenuItem alloc] initWithTitle:[NSString stringWithFormat:@"退出 %@", appName]
                                                    action:@selector(terminate:)
                                             keyEquivalent:@"q"];
  quitItem.target = NSApp;
  quitItem.keyEquivalentModifierMask = NSEventModifierFlagCommand;
  [appMenu addItem:quitItem];
  appMenuItem.submenu = appMenu;

  NSMenuItem *fileMenuItem = [[NSMenuItem alloc] initWithTitle:@"" action:nil keyEquivalent:@""];
  [mainMenu addItem:fileMenuItem];

  NSMenu *fileMenu = [[NSMenu alloc] initWithTitle:@"文件"];
  NSMenuItem *closeItem = [[NSMenuItem alloc] initWithTitle:@"关闭窗口"
                                                     action:@selector(closeWindow:)
                                              keyEquivalent:@"w"];
  closeItem.target = self;
  closeItem.keyEquivalentModifierMask = NSEventModifierFlagCommand;
  [fileMenu addItem:closeItem];
  fileMenuItem.submenu = fileMenu;

  NSApp.mainMenu = mainMenu;
}

- (NSTextField *)labelWithFrame:(NSRect)frame text:(NSString *)text fontSize:(CGFloat)fontSize bold:(BOOL)bold {
  NSTextField *field = [[NSTextField alloc] initWithFrame:frame];
  field.stringValue = text;
  field.editable = NO;
  field.selectable = YES;
  field.bezeled = NO;
  field.drawsBackground = NO;
  field.lineBreakMode = NSLineBreakByTruncatingMiddle;
  field.font = bold ? [NSFont boldSystemFontOfSize:fontSize] : [NSFont systemFontOfSize:fontSize];
  return field;
}

- (NSButton *)buttonWithFrame:(NSRect)frame title:(NSString *)title action:(SEL)action {
  NSButton *button = [[NSButton alloc] initWithFrame:frame];
  button.title = title;
  button.target = self;
  button.action = action;
  button.bezelStyle = NSBezelStyleRounded;
  return button;
}

- (void)buildWindow {
  NSRect frame = NSMakeRect(0, 0, 520, 260);
  self.window = [[NSWindow alloc] initWithContentRect:frame
                                           styleMask:(NSWindowStyleMaskTitled |
                                                      NSWindowStyleMaskClosable |
                                                      NSWindowStyleMaskMiniaturizable)
                                             backing:NSBackingStoreBuffered
                                               defer:NO];
  self.window.title = @"TrainTimer";
  [self.window center];

  NSView *content = self.window.contentView;
  self.statusField = [self labelWithFrame:NSMakeRect(24, 206, 468, 28)
                                     text:@"状态：启动中"
                                 fontSize:18
                                     bold:YES];
  self.urlField = [self labelWithFrame:NSMakeRect(24, 176, 468, 22)
                                  text:[NSString stringWithFormat:@"地址：%@  管理端口：%@", self.currentURL, TrainTimerPortRangeLabel(self.basePort)]
                              fontSize:13
                                  bold:NO];
  self.messageField = [self labelWithFrame:NSMakeRect(24, 130, 468, 44)
                                      text:@"正在启动本地服务。"
                                  fontSize:13
                                      bold:NO];
  self.messageField.lineBreakMode = NSLineBreakByWordWrapping;
  self.messageField.usesSingleLineMode = NO;
  self.logField = [self labelWithFrame:NSMakeRect(24, 24, 468, 20)
                                  text:[NSString stringWithFormat:@"日志：%@/launcher.log", TrainTimerStateDirectory()]
                              fontSize:11
                                  bold:NO];

  self.startButton = [self buttonWithFrame:NSMakeRect(24, 82, 92, 30) title:@"启动" action:@selector(startService:)];
  self.openButton = [self buttonWithFrame:NSMakeRect(124, 82, 92, 30) title:@"打开网页" action:@selector(openWeb:)];
  self.stopButton = [self buttonWithFrame:NSMakeRect(224, 82, 92, 30) title:@"停止" action:@selector(stopService:)];
  self.restartButton = [self buttonWithFrame:NSMakeRect(324, 82, 92, 30) title:@"重启" action:@selector(restartService:)];
  self.refreshButton = [self buttonWithFrame:NSMakeRect(424, 82, 68, 30) title:@"刷新" action:@selector(refreshStatus:)];

  [content addSubview:self.statusField];
  [content addSubview:self.urlField];
  [content addSubview:self.messageField];
  [content addSubview:self.logField];
  [content addSubview:self.startButton];
  [content addSubview:self.openButton];
  [content addSubview:self.stopButton];
  [content addSubview:self.restartButton];
  [content addSubview:self.refreshButton];
  [self setControlsEnabled:NO];
}

- (void)setControlsEnabled:(BOOL)enabled {
  BOOL canStart = enabled && !self.running && self.nodePath.length > 0;
  self.startButton.enabled = canStart;
  self.openButton.enabled = enabled && self.running;
  self.stopButton.enabled = enabled && self.running;
  self.restartButton.enabled = enabled && self.running;
  self.refreshButton.enabled = enabled && !self.busy;
}

- (void)setBusyMessage:(NSString *)message {
  self.busy = YES;
  self.messageField.stringValue = message;
  [self setControlsEnabled:NO];
}

- (void)showRunning {
  self.running = YES;
  self.busy = NO;
  self.statusField.stringValue = @"状态：运行中";
  self.urlField.stringValue = [NSString stringWithFormat:@"地址：%@  管理端口：%@", self.currentURL, TrainTimerPortRangeLabel(self.basePort)];
  self.messageField.stringValue = @"本地网页服务正在运行。";
  [self setControlsEnabled:YES];
}

- (void)showStoppedWithMessage:(NSString *)message {
  self.running = NO;
  self.busy = NO;
  self.statusField.stringValue = @"状态：未运行";
  self.urlField.stringValue = [NSString stringWithFormat:@"地址：%@  管理端口：%@", self.currentURL, TrainTimerPortRangeLabel(self.basePort)];
  self.messageField.stringValue = message ?: @"本地网页服务未运行。";
  [self setControlsEnabled:YES];
}

- (void)startService:(id)sender {
  NSInteger basePort = TrainTimerPortInteger(self.basePort, 3211);
  NSInteger endPort = TrainTimerManagedPortEnd(basePort);
  NSString *healthyURL = TrainTimerFindHealthyServiceURL(self.host, basePort, endPort);
  if (healthyURL.length > 0) {
    self.currentURL = healthyURL;
    self.port = [NSString stringWithFormat:@"%ld", (long)TrainTimerURLPort(healthyURL, basePort)];
    [self showRunning];
    [self openWeb:nil];
    return;
  }
  if (self.nodePath.length == 0) {
    [self showStoppedWithMessage:@"找不到 Node.js。请先安装 Node.js 18 或更高版本。"];
    return;
  }

  TrainTimerPrewarmChrome();
  [self setBusyMessage:@"正在启动服务；Chrome 已提前准备，服务就绪后会打开网页。"];
  NSString *nodePath = self.nodePath;
  NSString *projectRoot = self.projectRoot;
  NSString *host = self.host;
  NSString *basePortText = self.basePort;

  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    NSInteger startPort = TrainTimerPortInteger(basePortText, 3211);
    NSInteger stopPort = TrainTimerManagedPortEnd(startPort);
    TrainTimerAppendLog([NSString stringWithFormat:@"Preparing managed ports %ld-%ld", (long)startPort, (long)stopPort]);
    NSUInteger stopped = TrainTimerTerminateHealthyProjectServers(host, startPort, stopPort);
    NSInteger selectedPort = TrainTimerFirstAvailablePort(host, startPort, stopPort);
    if (selectedPort <= 0) {
      TrainTimerAppendLog(@"No available managed port");
      dispatch_async(dispatch_get_main_queue(), ^{
        [self showStoppedWithMessage:@"启动失败：管理端口段内没有可用端口。"];
      });
      return;
    }

    NSString *port = [NSString stringWithFormat:@"%ld", (long)selectedPort];
    NSString *currentURL = TrainTimerURLString(host, selectedPort);
    NSString *runtimeRoot = nil;
    NSString *runtimeError = nil;
    if (!TrainTimerPrepareRuntime(projectRoot, &runtimeRoot, &runtimeError)) {
      TrainTimerAppendLog([NSString stringWithFormat:@"Runtime preparation failed: %@", runtimeError ?: @"unknown"]);
      dispatch_async(dispatch_get_main_queue(), ^{
        [self showStoppedWithMessage:@"启动失败。请查看日志。"];
      });
      return;
    }

    TrainTimerAppendLog([NSString stringWithFormat:@"Starting direct service with %@ from %@ on %@; stopped %lu old service(s)",
                                                   nodePath,
                                                   runtimeRoot,
                                                   currentURL,
                                                   (unsigned long)stopped]);
    pid_t spawnedPid = 0;
    NSString *spawnError = nil;
    if (TrainTimerSpawnServer(nodePath, runtimeRoot, host, port, &spawnedPid, &spawnError) != 0) {
      TrainTimerAppendLog([NSString stringWithFormat:@"Direct service spawn failed: %@", spawnError ?: @"unknown"]);
      dispatch_async(dispatch_get_main_queue(), ^{
        [self showStoppedWithMessage:@"启动失败。请查看日志。"];
      });
      return;
    }

    BOOL healthy = NO;
    NSString *actualURL = currentURL;
    for (NSUInteger attempt = 0; attempt < 120; attempt++) {
      if (TrainTimerHealthCheck(currentURL)) {
        healthy = YES;
        break;
      }
      if (attempt > 1 && TrainTimerPidHasExited(spawnedPid)) {
        TrainTimerAppendLog([NSString stringWithFormat:@"Direct service exited before healthy: pid=%d", spawnedPid]);
        break;
      }
      if (attempt % 8 == 0) {
        NSString *foundURL = TrainTimerFindHealthyServiceURL(host, startPort, stopPort);
        if (foundURL.length > 0) {
          healthy = YES;
          actualURL = foundURL;
          break;
        }
      }
      [NSThread sleepForTimeInterval:0.25];
    }

    dispatch_async(dispatch_get_main_queue(), ^{
      if (healthy) {
        self.currentURL = actualURL;
        self.port = [NSString stringWithFormat:@"%ld", (long)TrainTimerURLPort(actualURL, selectedPort)];
        self.serverPid = spawnedPid;
        [self showRunning];
        [self openWeb:nil];
      } else {
        TrainTimerAppendLog(@"Direct service did not become healthy");
        TrainTimerTerminatePid(spawnedPid, 1.0);
        [self showStoppedWithMessage:@"启动失败或超时。请查看日志。"];
      }
    });
  });
}

- (void)openWeb:(id)sender {
  NSURL *url = [NSURL URLWithString:self.currentURL];
  BOOL opened = TrainTimerOpenURLPreferChrome(url);
  self.messageField.stringValue = opened ? @"网页已用 Chrome 打开。" : [NSString stringWithFormat:@"无法自动打开网页：%@", self.currentURL];
}

- (void)stopService:(id)sender {
  NSInteger basePort = TrainTimerPortInteger(self.basePort, 3211);
  NSInteger endPort = TrainTimerManagedPortEnd(basePort);
  if (!self.running && !TrainTimerFindHealthyServiceURL(self.host, basePort, endPort)) {
    [self showStoppedWithMessage:@"本地网页服务未运行。"];
    return;
  }

  [self setBusyMessage:@"正在停止服务。"];
  NSString *host = self.host;
  NSString *basePortText = self.basePort;
  pid_t serverPid = self.serverPid;
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    TrainTimerAppendLog(@"Stopping TrainTimer service");
    if (serverPid > 0) TrainTimerTerminatePid(serverPid, 1.5);
    TrainTimerStopLaunchAgent(YES);
    NSInteger startPort = TrainTimerPortInteger(basePortText, 3211);
    NSInteger stopPort = TrainTimerManagedPortEnd(startPort);
    NSUInteger stopped = TrainTimerTerminateHealthyProjectServers(host, startPort, stopPort);

    dispatch_async(dispatch_get_main_queue(), ^{
      self.serverPid = 0;
      [self showStoppedWithMessage:[NSString stringWithFormat:@"本地网页服务已停止；已清理 %lu 个项目端口服务。", (unsigned long)stopped]];
    });
  });
}

- (void)restartService:(id)sender {
  NSInteger basePort = TrainTimerPortInteger(self.basePort, 3211);
  NSInteger endPort = TrainTimerManagedPortEnd(basePort);
  if (!self.running && !TrainTimerFindHealthyServiceURL(self.host, basePort, endPort)) {
    [self startService:nil];
    return;
  }

  [self setBusyMessage:@"正在重启服务。"];
  NSString *host = self.host;
  NSString *basePortText = self.basePort;
  pid_t serverPid = self.serverPid;
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    TrainTimerAppendLog(@"Restarting TrainTimer service");
    if (serverPid > 0) TrainTimerTerminatePid(serverPid, 1.5);
    TrainTimerStopLaunchAgent(YES);
    NSInteger startPort = TrainTimerPortInteger(basePortText, 3211);
    NSInteger stopPort = TrainTimerManagedPortEnd(startPort);
    TrainTimerTerminateHealthyProjectServers(host, startPort, stopPort);

    dispatch_async(dispatch_get_main_queue(), ^{
      self.serverPid = 0;
      [self startService:nil];
    });
  });
}

- (void)refreshStatus:(id)sender {
  if (self.busy && sender != nil) return;

  dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
    NSInteger basePort = TrainTimerPortInteger(self.basePort, 3211);
    NSInteger endPort = TrainTimerManagedPortEnd(basePort);
    NSString *healthyURL = TrainTimerFindHealthyServiceURL(self.host, basePort, endPort);
    dispatch_async(dispatch_get_main_queue(), ^{
      if (healthyURL.length > 0) {
        self.currentURL = healthyURL;
        self.port = [NSString stringWithFormat:@"%ld", (long)TrainTimerURLPort(healthyURL, basePort)];
        [self showRunning];
      } else {
        [self showStoppedWithMessage:@"本地网页服务未运行。"];
      }
    });
  });
}

@end

static void TrainTimerRunDirectAction(NSString *requestedAction) {
  NSString *host = @"127.0.0.1";
  NSString *port = [[NSProcessInfo processInfo] environment][@"PORT"] ?: @"3211";
  NSInteger basePort = TrainTimerPortInteger(port, 3211);
  NSInteger endPort = TrainTimerManagedPortEnd(basePort);

  if ([requestedAction isEqualToString:@"status"]) {
    NSString *url = TrainTimerFindHealthyServiceURL(host, basePort, endPort);
    if (url.length > 0) {
      fprintf(stdout, "TrainTimer %s\n", [url UTF8String]);
      exit(0);
    }
    fprintf(stdout, "TrainTimer is not running\n");
    exit(1);
  }

  fprintf(stdout, "TrainTimer.app direct mode only supports status\n");
  exit(1);
}

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    NSString *executablePath = [[NSProcessInfo processInfo] arguments].firstObject;
    NSString *macOSDirectory = [executablePath stringByDeletingLastPathComponent];
    NSString *contentsDirectory = [macOSDirectory stringByDeletingLastPathComponent];
    NSString *runtimeRoot = TrainTimerBundledRuntimeDirectory();
    NSString *serverPath = [runtimeRoot stringByAppendingPathComponent:@"src/server.js"];

    TrainTimerAppendLog([NSString stringWithFormat:@"Invoked app executable: %@", executablePath]);
    TrainTimerAppendLog([NSString stringWithFormat:@"Resolved bundled runtime: %@", runtimeRoot]);

    NSString *requestedAction = [[NSProcessInfo processInfo] environment][@"TRAIN_TIMER_ACTION"];
    if (requestedAction.length > 0) {
      TrainTimerRunDirectAction(requestedAction);
    }

    BOOL isDirectory = NO;
    if (![[NSFileManager defaultManager] fileExistsAtPath:serverPath isDirectory:&isDirectory] || isDirectory) {
      [NSApplication sharedApplication];
      [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
      [NSApp activateIgnoringOtherApps:YES];
      NSAlert *alert = [[NSAlert alloc] init];
      alert.messageText = @"TrainTimer 启动失败";
      alert.informativeText = [NSString stringWithFormat:@"找不到服务入口：%@", serverPath];
      [alert addButtonWithTitle:@"好"];
      [alert runModal];
      return 1;
    }

    [NSApplication sharedApplication];
    static TrainTimerAppDelegate *delegate = nil;
    delegate = [[TrainTimerAppDelegate alloc] initWithProjectRoot:runtimeRoot];
    [NSApp setDelegate:delegate];
    [NSApp run];
  }

  return 0;
}
