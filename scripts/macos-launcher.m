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

typedef void (^TrainTimerOpenCompletion)(BOOL opened, BOOL usedChrome, NSError *error);

static void TrainTimerOpenURLPreferChrome(NSURL *url, TrainTimerOpenCompletion completion) {
  if (!url) {
    if (completion) completion(NO, NO, nil);
    return;
  }
  NSURL *chromeURL = TrainTimerChromeApplicationURL();
  if (chromeURL) {
    if (@available(macOS 10.15, *)) {
      NSWorkspaceOpenConfiguration *configuration = [NSWorkspaceOpenConfiguration configuration];
      configuration.activates = YES;
      [[NSWorkspace sharedWorkspace] openURLs:@[url]
                         withApplicationAtURL:chromeURL
                                configuration:configuration
                            completionHandler:^(NSRunningApplication *app, NSError *error) {
        (void)app;
        if (error) {
          TrainTimerAppendLog([NSString stringWithFormat:@"Chrome open failed: %@", error.localizedDescription]);
        }
        if (completion) completion(error == nil, YES, error);
      }];
      return;
    }
  }
  BOOL opened = [[NSWorkspace sharedWorkspace] openURL:url];
  if (completion) completion(opened, NO, nil);
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
      (void)app;
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

static NSToolbarItemIdentifier TrainTimerToolbarRefreshItemIdentifier = @"local.traintimer.toolbar.refresh";
static NSToolbarItemIdentifier TrainTimerToolbarLogItemIdentifier = @"local.traintimer.toolbar.log";

@interface TrainTimerAppDelegate : NSObject <NSApplicationDelegate, NSToolbarDelegate, NSMenuItemValidation, NSToolbarItemValidation>
@property(nonatomic, copy) NSString *projectRoot;
@property(nonatomic, copy) NSString *nodePath;
@property(nonatomic, copy) NSString *host;
@property(nonatomic, copy) NSString *basePort;
@property(nonatomic, copy) NSString *port;
@property(nonatomic, copy) NSString *currentURL;
@property(atomic, assign) pid_t serverPid;
@property(nonatomic, strong) NSWindow *window;
@property(nonatomic, strong) NSImageView *statusImageView;
@property(nonatomic, strong) NSProgressIndicator *progressIndicator;
@property(nonatomic, strong) NSTextField *statusField;
@property(nonatomic, strong) NSTextField *urlField;
@property(nonatomic, strong) NSTextField *messageField;
@property(nonatomic, strong) NSTextField *browserField;
@property(nonatomic, strong) NSTextField *lastCheckField;
@property(nonatomic, strong) NSTextField *feedbackField;
@property(nonatomic, strong) NSButton *primaryButton;
@property(nonatomic, strong) NSButton *stopButton;
@property(nonatomic, strong) NSButton *restartButton;
@property(nonatomic, strong) NSButton *urlCopyButton;
@property(nonatomic, strong) NSTimer *statusTimer;
@property(nonatomic, strong) dispatch_group_t startupGroup;
@property(nonatomic, assign) BOOL running;
@property(nonatomic, assign) BOOL busy;
@property(nonatomic, assign) BOOL refreshInFlight;
@property(atomic, assign) BOOL terminating;
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
  _startupGroup = dispatch_group_create();
  return self;
}

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
  [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
  [self buildMenu];
  [self buildWindow];
  [self.window makeKeyAndOrderFront:nil];
  [NSApp activateIgnoringOtherApps:YES];

  [self startService:nil];
  self.statusTimer = [NSTimer scheduledTimerWithTimeInterval:5.0
                                                     target:self
                                                   selector:@selector(refreshStatus:)
                                                   userInfo:nil
                                                    repeats:YES];
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {
  return YES;
}

- (void)applicationWillTerminate:(NSNotification *)notification {
  self.terminating = YES;
  [self.statusTimer invalidate];
  self.statusTimer = nil;
  TrainTimerAppendLog(@"Window is closing; stopping TrainTimer service");
  if (self.serverPid > 0) {
    TrainTimerTerminatePid(self.serverPid, 1.5);
    self.serverPid = 0;
  }
  dispatch_group_wait(self.startupGroup, dispatch_time(DISPATCH_TIME_NOW, (int64_t)(2.5 * NSEC_PER_SEC)));
  if (self.serverPid > 0) {
    TrainTimerTerminatePid(self.serverPid, 1.0);
    self.serverPid = 0;
  }
  NSInteger basePort = TrainTimerPortInteger(self.basePort, 3211);
  TrainTimerTerminateHealthyProjectServers(self.host, basePort, TrainTimerManagedPortEnd(basePort));
  TrainTimerStopLaunchAgent(YES);
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
  NSMenuItem *aboutItem = [[NSMenuItem alloc] initWithTitle:@"关于 TrainTimer"
                                                    action:@selector(orderFrontStandardAboutPanel:)
                                             keyEquivalent:@""];
  aboutItem.target = NSApp;
  [appMenu addItem:aboutItem];
  [appMenu addItem:[NSMenuItem separatorItem]];

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

  NSMenuItem *serviceMenuItem = [[NSMenuItem alloc] initWithTitle:@"" action:nil keyEquivalent:@""];
  [mainMenu addItem:serviceMenuItem];
  NSMenu *serviceMenu = [[NSMenu alloc] initWithTitle:@"服务"];

  NSMenuItem *openItem = [self menuItemWithTitle:@"打开 TrainTimer"
                                         action:@selector(performPrimaryAction:)
                                            key:@"o"
                                      modifiers:NSEventModifierFlagCommand
                                          symbol:@"globe"];
  [serviceMenu addItem:openItem];
  [serviceMenu addItem:[self menuItemWithTitle:@"刷新状态"
                                        action:@selector(refreshStatus:)
                                           key:@"r"
                                     modifiers:NSEventModifierFlagCommand
                                         symbol:@"arrow.clockwise"]];
  [serviceMenu addItem:[NSMenuItem separatorItem]];
  [serviceMenu addItem:[self menuItemWithTitle:@"停止服务"
                                        action:@selector(stopService:)
                                           key:@""
                                     modifiers:0
                                         symbol:@"stop.fill"]];
  [serviceMenu addItem:[self menuItemWithTitle:@"重新启动服务"
                                        action:@selector(restartService:)
                                           key:@"r"
                                     modifiers:(NSEventModifierFlagCommand | NSEventModifierFlagOption)
                                         symbol:@"arrow.clockwise"]];
  [serviceMenu addItem:[NSMenuItem separatorItem]];
  [serviceMenu addItem:[self menuItemWithTitle:@"复制网页地址"
                                        action:@selector(copyURL:)
                                           key:@"c"
                                     modifiers:(NSEventModifierFlagCommand | NSEventModifierFlagShift)
                                         symbol:@"doc.on.doc"]];
  [serviceMenu addItem:[self menuItemWithTitle:@"显示日志"
                                        action:@selector(revealLog:)
                                           key:@"l"
                                     modifiers:(NSEventModifierFlagCommand | NSEventModifierFlagOption)
                                         symbol:@"doc.text.magnifyingglass"]];
  serviceMenuItem.submenu = serviceMenu;

  NSMenuItem *windowMenuItem = [[NSMenuItem alloc] initWithTitle:@"" action:nil keyEquivalent:@""];
  [mainMenu addItem:windowMenuItem];
  NSMenu *windowMenu = [[NSMenu alloc] initWithTitle:@"窗口"];
  NSMenuItem *minimizeItem = [[NSMenuItem alloc] initWithTitle:@"最小化"
                                                       action:@selector(performMiniaturize:)
                                                keyEquivalent:@"m"];
  minimizeItem.keyEquivalentModifierMask = NSEventModifierFlagCommand;
  [windowMenu addItem:minimizeItem];
  windowMenuItem.submenu = windowMenu;
  NSApp.windowsMenu = windowMenu;

  NSApp.mainMenu = mainMenu;
}

- (NSMenuItem *)menuItemWithTitle:(NSString *)title
                           action:(SEL)action
                              key:(NSString *)key
                        modifiers:(NSEventModifierFlags)modifiers
                            symbol:(NSString *)symbol {
  NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:title action:action keyEquivalent:key ?: @""];
  item.target = self;
  item.keyEquivalentModifierMask = modifiers;
  item.image = [NSImage imageWithSystemSymbolName:symbol accessibilityDescription:title];
  return item;
}

- (NSTextField *)labelWithText:(NSString *)text
                          font:(NSFont *)font
                         color:(NSColor *)color
                    selectable:(BOOL)selectable {
  NSTextField *field = [[NSTextField alloc] initWithFrame:NSZeroRect];
  field.translatesAutoresizingMaskIntoConstraints = NO;
  field.stringValue = text;
  field.editable = NO;
  field.selectable = selectable;
  field.bezeled = NO;
  field.drawsBackground = NO;
  field.lineBreakMode = NSLineBreakByTruncatingMiddle;
  field.font = font;
  field.textColor = color;
  return field;
}

- (NSImage *)symbolImageNamed:(NSString *)name description:(NSString *)description pointSize:(CGFloat)pointSize {
  NSImage *image = [NSImage imageWithSystemSymbolName:name accessibilityDescription:description];
  NSImageSymbolConfiguration *configuration = [NSImageSymbolConfiguration configurationWithPointSize:pointSize
                                                                                                weight:NSFontWeightMedium];
  return [image imageWithSymbolConfiguration:configuration];
}

- (NSButton *)buttonWithTitle:(NSString *)title symbol:(NSString *)symbol action:(SEL)action {
  NSButton *button = [[NSButton alloc] initWithFrame:NSZeroRect];
  button.translatesAutoresizingMaskIntoConstraints = NO;
  button.title = title;
  button.target = self;
  button.action = action;
  button.bezelStyle = NSBezelStylePush;
  if (symbol.length > 0) {
    button.image = [self symbolImageNamed:symbol description:title pointSize:14.0];
    button.imagePosition = NSImageLeading;
    button.imageHugsTitle = YES;
  }
  return button;
}

- (NSStackView *)detailRowWithSymbol:(NSString *)symbol
                                label:(NSString *)label
                                value:(NSTextField *)value
                              trailing:(NSView *)trailing {
  NSImageView *iconView = [[NSImageView alloc] initWithFrame:NSZeroRect];
  iconView.translatesAutoresizingMaskIntoConstraints = NO;
  iconView.image = [self symbolImageNamed:symbol description:label pointSize:13.0];
  iconView.contentTintColor = NSColor.secondaryLabelColor;
  iconView.imageScaling = NSImageScaleProportionallyDown;
  [NSLayoutConstraint activateConstraints:@[
    [iconView.widthAnchor constraintEqualToConstant:18.0],
    [iconView.heightAnchor constraintEqualToConstant:18.0]
  ]];

  NSTextField *labelField = [self labelWithText:label
                                           font:[NSFont systemFontOfSize:12.0 weight:NSFontWeightMedium]
                                          color:NSColor.secondaryLabelColor
                                     selectable:NO];
  [labelField.widthAnchor constraintEqualToConstant:68.0].active = YES;

  [value setContentCompressionResistancePriority:NSLayoutPriorityDefaultLow
                                  forOrientation:NSLayoutConstraintOrientationHorizontal];
  [value setContentHuggingPriority:NSLayoutPriorityDefaultHigh
                    forOrientation:NSLayoutConstraintOrientationHorizontal];

  NSView *spacer = [[NSView alloc] initWithFrame:NSZeroRect];
  [spacer setContentHuggingPriority:1.0 forOrientation:NSLayoutConstraintOrientationHorizontal];
  [spacer setContentCompressionResistancePriority:1.0 forOrientation:NSLayoutConstraintOrientationHorizontal];
  [spacer.heightAnchor constraintEqualToConstant:0.0].active = YES;

  NSMutableArray<NSView *> *views = [NSMutableArray arrayWithObjects:iconView, labelField, value, spacer, nil];
  if (trailing) [views addObject:trailing];
  NSStackView *row = [NSStackView stackViewWithViews:views];
  row.translatesAutoresizingMaskIntoConstraints = NO;
  row.orientation = NSUserInterfaceLayoutOrientationHorizontal;
  row.alignment = NSLayoutAttributeCenterY;
  row.distribution = NSStackViewDistributionFill;
  row.spacing = 10.0;
  return row;
}

- (void)buildWindow {
  NSRect frame = NSMakeRect(0, 0, 680, 420);
  self.window = [[NSWindow alloc] initWithContentRect:frame
                                           styleMask:(NSWindowStyleMaskTitled |
                                                      NSWindowStyleMaskClosable |
                                                      NSWindowStyleMaskMiniaturizable |
                                                      NSWindowStyleMaskResizable)
                                             backing:NSBackingStoreBuffered
                                               defer:NO];
  self.window.title = @"TrainTimer";
  self.window.titleVisibility = NSWindowTitleHidden;
  self.window.toolbarStyle = NSWindowToolbarStyleUnified;
  self.window.tabbingMode = NSWindowTabbingModeDisallowed;
  self.window.contentMinSize = NSMakeSize(600, 400);
  [self.window setFrameAutosaveName:@"TrainTimerLauncherWindowFrameV2"];
  if (![self.window setFrameUsingName:@"TrainTimerLauncherWindowFrameV2"]) {
    [self.window center];
  }

  NSToolbar *toolbar = [[NSToolbar alloc] initWithIdentifier:@"TrainTimerLauncherToolbar"];
  toolbar.delegate = self;
  toolbar.displayMode = NSToolbarDisplayModeIconOnly;
  toolbar.allowsUserCustomization = NO;
  self.window.toolbar = toolbar;

  NSVisualEffectView *content = [[NSVisualEffectView alloc] initWithFrame:NSZeroRect];
  content.material = NSVisualEffectMaterialWindowBackground;
  content.blendingMode = NSVisualEffectBlendingModeBehindWindow;
  content.state = NSVisualEffectStateFollowsWindowActiveState;
  self.window.contentView = content;

  NSImageView *appIcon = [[NSImageView alloc] initWithFrame:NSZeroRect];
  appIcon.translatesAutoresizingMaskIntoConstraints = NO;
  appIcon.image = [NSImage imageNamed:NSImageNameApplicationIcon];
  appIcon.imageScaling = NSImageScaleProportionallyUpOrDown;
  [NSLayoutConstraint activateConstraints:@[
    [appIcon.widthAnchor constraintEqualToConstant:48.0],
    [appIcon.heightAnchor constraintEqualToConstant:48.0]
  ]];

  NSTextField *appNameField = [self labelWithText:@"TrainTimer"
                                             font:[NSFont systemFontOfSize:22.0 weight:NSFontWeightSemibold]
                                            color:NSColor.labelColor
                                       selectable:NO];
  NSString *subtitle = TrainTimerChromeApplicationURL() ? @"本地计时器服务 · 服务就绪后自动在 Chrome 中打开" : @"本地计时器服务 · 服务就绪后自动打开网页";
  NSTextField *appSubtitleField = [self labelWithText:subtitle
                                                 font:[NSFont systemFontOfSize:13.0 weight:NSFontWeightRegular]
                                                color:NSColor.secondaryLabelColor
                                           selectable:NO];
  NSView *titleStack = [[NSView alloc] initWithFrame:NSZeroRect];
  titleStack.translatesAutoresizingMaskIntoConstraints = NO;
  [titleStack addSubview:appNameField];
  [titleStack addSubview:appSubtitleField];
  [NSLayoutConstraint activateConstraints:@[
    [appNameField.leadingAnchor constraintEqualToAnchor:titleStack.leadingAnchor],
    [appNameField.topAnchor constraintEqualToAnchor:titleStack.topAnchor],
    [appNameField.trailingAnchor constraintLessThanOrEqualToAnchor:titleStack.trailingAnchor],
    [appSubtitleField.leadingAnchor constraintEqualToAnchor:titleStack.leadingAnchor],
    [appSubtitleField.trailingAnchor constraintEqualToAnchor:titleStack.trailingAnchor],
    [appSubtitleField.topAnchor constraintEqualToAnchor:appNameField.bottomAnchor constant:3.0],
    [appSubtitleField.bottomAnchor constraintEqualToAnchor:titleStack.bottomAnchor]
  ]];
  [titleStack setContentHuggingPriority:NSLayoutPriorityRequired forOrientation:NSLayoutConstraintOrientationHorizontal];
  [titleStack setContentCompressionResistancePriority:NSLayoutPriorityDefaultHigh forOrientation:NSLayoutConstraintOrientationHorizontal];
  [appNameField setContentHuggingPriority:NSLayoutPriorityRequired forOrientation:NSLayoutConstraintOrientationHorizontal];
  [appSubtitleField setContentHuggingPriority:NSLayoutPriorityRequired forOrientation:NSLayoutConstraintOrientationHorizontal];
  NSView *headerSpacer = [[NSView alloc] initWithFrame:NSZeroRect];
  [headerSpacer setContentHuggingPriority:1.0 forOrientation:NSLayoutConstraintOrientationHorizontal];
  [headerSpacer setContentCompressionResistancePriority:1.0 forOrientation:NSLayoutConstraintOrientationHorizontal];
  [headerSpacer.heightAnchor constraintEqualToConstant:0.0].active = YES;
  NSStackView *header = [NSStackView stackViewWithViews:@[appIcon, titleStack, headerSpacer]];
  header.orientation = NSUserInterfaceLayoutOrientationHorizontal;
  header.alignment = NSLayoutAttributeCenterY;
  header.spacing = 14.0;

  NSBox *statusCard = [[NSBox alloc] initWithFrame:NSZeroRect];
  statusCard.translatesAutoresizingMaskIntoConstraints = NO;
  statusCard.boxType = NSBoxCustom;
  statusCard.titlePosition = NSNoTitle;
  statusCard.borderWidth = 1.0;
  statusCard.cornerRadius = 16.0;
  statusCard.borderColor = NSColor.separatorColor;
  statusCard.fillColor = NSColor.controlBackgroundColor;

  NSView *statusIconContainer = [[NSView alloc] initWithFrame:NSZeroRect];
  statusIconContainer.translatesAutoresizingMaskIntoConstraints = NO;
  [NSLayoutConstraint activateConstraints:@[
    [statusIconContainer.widthAnchor constraintEqualToConstant:40.0],
    [statusIconContainer.heightAnchor constraintEqualToConstant:40.0]
  ]];

  self.statusImageView = [[NSImageView alloc] initWithFrame:NSZeroRect];
  self.statusImageView.translatesAutoresizingMaskIntoConstraints = NO;
  self.statusImageView.imageScaling = NSImageScaleProportionallyUpOrDown;
  [self.statusImageView setAccessibilityElement:NO];
  [statusIconContainer addSubview:self.statusImageView];

  self.progressIndicator = [[NSProgressIndicator alloc] initWithFrame:NSZeroRect];
  self.progressIndicator.translatesAutoresizingMaskIntoConstraints = NO;
  self.progressIndicator.style = NSProgressIndicatorStyleSpinning;
  self.progressIndicator.controlSize = NSControlSizeRegular;
  self.progressIndicator.displayedWhenStopped = NO;
  self.progressIndicator.accessibilityLabel = @"正在检查本地服务";
  [statusIconContainer addSubview:self.progressIndicator];
  [NSLayoutConstraint activateConstraints:@[
    [self.statusImageView.centerXAnchor constraintEqualToAnchor:statusIconContainer.centerXAnchor],
    [self.statusImageView.centerYAnchor constraintEqualToAnchor:statusIconContainer.centerYAnchor],
    [self.statusImageView.widthAnchor constraintEqualToConstant:36.0],
    [self.statusImageView.heightAnchor constraintEqualToConstant:36.0],
    [self.progressIndicator.centerXAnchor constraintEqualToAnchor:statusIconContainer.centerXAnchor],
    [self.progressIndicator.centerYAnchor constraintEqualToAnchor:statusIconContainer.centerYAnchor]
  ]];

  self.statusField = [self labelWithText:@"正在启动 TrainTimer"
                                    font:[NSFont systemFontOfSize:20.0 weight:NSFontWeightSemibold]
                                   color:NSColor.labelColor
                              selectable:NO];
  NSString *initialMessage = TrainTimerChromeApplicationURL() ? @"服务就绪后会自动在 Chrome 中打开。" : @"服务就绪后会自动在默认浏览器中打开。";
  self.messageField = [self labelWithText:initialMessage
                                     font:[NSFont systemFontOfSize:13.0 weight:NSFontWeightRegular]
                                    color:NSColor.secondaryLabelColor
                               selectable:NO];
  self.messageField.lineBreakMode = NSLineBreakByWordWrapping;
  self.messageField.usesSingleLineMode = NO;
  self.messageField.maximumNumberOfLines = 2;
  NSStackView *statusTextStack = [NSStackView stackViewWithViews:@[self.statusField, self.messageField]];
  statusTextStack.orientation = NSUserInterfaceLayoutOrientationVertical;
  statusTextStack.alignment = NSLayoutAttributeLeading;
  statusTextStack.spacing = 4.0;
  [self.messageField.widthAnchor constraintLessThanOrEqualToConstant:510.0].active = YES;

  NSStackView *statusHeader = [NSStackView stackViewWithViews:@[statusIconContainer, statusTextStack]];
  statusHeader.translatesAutoresizingMaskIntoConstraints = NO;
  statusHeader.orientation = NSUserInterfaceLayoutOrientationHorizontal;
  statusHeader.alignment = NSLayoutAttributeCenterY;
  statusHeader.spacing = 14.0;
  statusHeader.accessibilityRole = NSAccessibilityGroupRole;
  statusHeader.accessibilityLabel = @"服务状态";

  NSBox *separator = [[NSBox alloc] initWithFrame:NSZeroRect];
  separator.boxType = NSBoxSeparator;
  separator.translatesAutoresizingMaskIntoConstraints = NO;

  self.urlField = [self labelWithText:self.currentURL
                                  font:[NSFont monospacedSystemFontOfSize:12.5 weight:NSFontWeightRegular]
                                 color:NSColor.labelColor
                            selectable:YES];
  self.urlField.toolTip = [NSString stringWithFormat:@"TrainTimer 本地网页地址 · 管理端口 %@", TrainTimerPortRangeLabel(self.basePort)];
  self.urlCopyButton = [self buttonWithTitle:@"" symbol:@"doc.on.doc" action:@selector(copyURL:)];
  self.urlCopyButton.bezelStyle = NSBezelStyleAccessoryBarAction;
  self.urlCopyButton.borderShape = NSControlBorderShapeCircle;
  self.urlCopyButton.toolTip = @"复制网页地址";
  self.urlCopyButton.accessibilityLabel = @"复制网页地址";
  [self.urlCopyButton.widthAnchor constraintEqualToConstant:30.0].active = YES;

  self.browserField = [self labelWithText:(TrainTimerChromeApplicationURL() ? @"Google Chrome · 启动后自动打开" : @"默认浏览器 · 未检测到 Google Chrome")
                                      font:[NSFont systemFontOfSize:12.5 weight:NSFontWeightRegular]
                                     color:NSColor.labelColor
                                selectable:NO];
  NSTextField *securityField = [self labelWithText:@"仅这台 Mac 可访问"
                                               font:[NSFont systemFontOfSize:12.5 weight:NSFontWeightRegular]
                                              color:NSColor.labelColor
                                         selectable:NO];

  NSStackView *urlRow = [self detailRowWithSymbol:@"link" label:@"网页地址" value:self.urlField trailing:self.urlCopyButton];
  NSStackView *browserRow = [self detailRowWithSymbol:@"globe" label:@"浏览器" value:self.browserField trailing:nil];
  NSStackView *securityRow = [self detailRowWithSymbol:@"lock.shield" label:@"访问范围" value:securityField trailing:nil];
  NSStackView *detailStack = [NSStackView stackViewWithViews:@[urlRow, browserRow, securityRow]];
  detailStack.translatesAutoresizingMaskIntoConstraints = NO;
  detailStack.orientation = NSUserInterfaceLayoutOrientationVertical;
  detailStack.alignment = NSLayoutAttributeLeading;
  detailStack.distribution = NSStackViewDistributionFillEqually;
  detailStack.spacing = 10.0;
  [urlRow.widthAnchor constraintEqualToAnchor:detailStack.widthAnchor].active = YES;
  [browserRow.widthAnchor constraintEqualToAnchor:detailStack.widthAnchor].active = YES;
  [securityRow.widthAnchor constraintEqualToAnchor:detailStack.widthAnchor].active = YES;

  NSStackView *cardStack = [NSStackView stackViewWithViews:@[statusHeader, separator, detailStack]];
  cardStack.translatesAutoresizingMaskIntoConstraints = NO;
  cardStack.orientation = NSUserInterfaceLayoutOrientationVertical;
  cardStack.alignment = NSLayoutAttributeLeading;
  cardStack.spacing = 15.0;
  [statusCard.contentView addSubview:cardStack];
  [NSLayoutConstraint activateConstraints:@[
    [cardStack.leadingAnchor constraintEqualToAnchor:statusCard.contentView.leadingAnchor constant:22.0],
    [cardStack.trailingAnchor constraintEqualToAnchor:statusCard.contentView.trailingAnchor constant:-22.0],
    [cardStack.topAnchor constraintEqualToAnchor:statusCard.contentView.topAnchor constant:20.0],
    [cardStack.bottomAnchor constraintEqualToAnchor:statusCard.contentView.bottomAnchor constant:-20.0],
    [statusHeader.widthAnchor constraintEqualToAnchor:cardStack.widthAnchor],
    [separator.widthAnchor constraintEqualToAnchor:cardStack.widthAnchor],
    [detailStack.widthAnchor constraintEqualToAnchor:cardStack.widthAnchor],
    [statusCard.heightAnchor constraintGreaterThanOrEqualToConstant:210.0]
  ]];

  self.primaryButton = [self buttonWithTitle:@"正在启动" symbol:@"globe" action:@selector(performPrimaryAction:)];
  self.primaryButton.controlSize = NSControlSizeExtraLarge;
  self.primaryButton.bezelStyle = NSBezelStylePush;
  self.primaryButton.tintProminence = NSTintProminencePrimary;
  self.primaryButton.borderShape = NSControlBorderShapeCapsule;
  self.primaryButton.keyEquivalent = @"\r";
  self.primaryButton.keyEquivalentModifierMask = 0;
  self.primaryButton.toolTip = TrainTimerChromeApplicationURL() ? @"启动服务，或在 Google Chrome 中打开 TrainTimer" : @"启动服务，或在默认浏览器中打开 TrainTimer";
  [self.primaryButton.widthAnchor constraintGreaterThanOrEqualToConstant:220.0].active = YES;

  self.stopButton = [self buttonWithTitle:@"停止服务" symbol:@"stop.fill" action:@selector(stopService:)];
  self.stopButton.controlSize = NSControlSizeLarge;
  self.stopButton.toolTip = @"停止 TrainTimer 本地服务";

  self.restartButton = [self buttonWithTitle:@"重新启动" symbol:@"arrow.clockwise" action:@selector(restartService:)];
  self.restartButton.controlSize = NSControlSizeLarge;
  self.restartButton.toolTip = @"重新启动 TrainTimer 本地服务";

  NSView *actionSpacer = [[NSView alloc] initWithFrame:NSZeroRect];
  [actionSpacer setContentHuggingPriority:NSLayoutPriorityDefaultLow forOrientation:NSLayoutConstraintOrientationHorizontal];
  [actionSpacer.heightAnchor constraintEqualToConstant:0.0].active = YES;
  NSStackView *actionRow = [NSStackView stackViewWithViews:@[actionSpacer, self.stopButton, self.restartButton, self.primaryButton]];
  actionRow.orientation = NSUserInterfaceLayoutOrientationHorizontal;
  actionRow.alignment = NSLayoutAttributeCenterY;
  actionRow.spacing = 10.0;

  self.lastCheckField = [self labelWithText:@"正在检查服务状态"
                                        font:[NSFont systemFontOfSize:11.5 weight:NSFontWeightRegular]
                                       color:NSColor.tertiaryLabelColor
                                  selectable:NO];
  self.feedbackField = [self labelWithText:@""
                                       font:[NSFont systemFontOfSize:11.5 weight:NSFontWeightMedium]
                                      color:NSColor.secondaryLabelColor
                                 selectable:NO];
  self.feedbackField.lineBreakMode = NSLineBreakByTruncatingTail;
  NSTextField *closeHintField = [self labelWithText:@"关闭窗口即停止服务"
                                                font:[NSFont systemFontOfSize:12.0 weight:NSFontWeightRegular]
                                               color:NSColor.secondaryLabelColor
                                          selectable:NO];
  NSImageView *closeHintIcon = [[NSImageView alloc] initWithFrame:NSZeroRect];
  closeHintIcon.translatesAutoresizingMaskIntoConstraints = NO;
  closeHintIcon.image = [self symbolImageNamed:@"info.circle" description:@"关闭提示" pointSize:11.0];
  closeHintIcon.contentTintColor = NSColor.secondaryLabelColor;
  [closeHintIcon.widthAnchor constraintEqualToConstant:14.0].active = YES;
  [closeHintIcon.heightAnchor constraintEqualToConstant:14.0].active = YES;
  NSStackView *closeHint = [NSStackView stackViewWithViews:@[closeHintIcon, closeHintField]];
  closeHint.orientation = NSUserInterfaceLayoutOrientationHorizontal;
  closeHint.alignment = NSLayoutAttributeCenterY;
  closeHint.spacing = 5.0;
  NSView *footerSpacer = [[NSView alloc] initWithFrame:NSZeroRect];
  [footerSpacer setContentHuggingPriority:NSLayoutPriorityDefaultLow forOrientation:NSLayoutConstraintOrientationHorizontal];
  [footerSpacer.heightAnchor constraintEqualToConstant:0.0].active = YES;
  NSStackView *footer = [NSStackView stackViewWithViews:@[self.lastCheckField, self.feedbackField, footerSpacer, closeHint]];
  footer.orientation = NSUserInterfaceLayoutOrientationHorizontal;
  footer.alignment = NSLayoutAttributeCenterY;
  footer.spacing = 8.0;

  NSStackView *layout = [NSStackView stackViewWithViews:@[header, statusCard, actionRow, footer]];
  layout.translatesAutoresizingMaskIntoConstraints = NO;
  layout.orientation = NSUserInterfaceLayoutOrientationVertical;
  layout.alignment = NSLayoutAttributeLeading;
  layout.distribution = NSStackViewDistributionFill;
  layout.spacing = 18.0;
  [content addSubview:layout];
  [NSLayoutConstraint activateConstraints:@[
    [layout.leadingAnchor constraintEqualToAnchor:content.leadingAnchor constant:28.0],
    [layout.trailingAnchor constraintEqualToAnchor:content.trailingAnchor constant:-28.0],
    [layout.topAnchor constraintEqualToAnchor:content.topAnchor constant:22.0],
    [layout.bottomAnchor constraintLessThanOrEqualToAnchor:content.bottomAnchor constant:-18.0],
    [header.widthAnchor constraintEqualToAnchor:layout.widthAnchor],
    [statusCard.widthAnchor constraintEqualToAnchor:layout.widthAnchor],
    [actionRow.widthAnchor constraintEqualToAnchor:layout.widthAnchor],
    [footer.widthAnchor constraintEqualToAnchor:layout.widthAnchor]
  ]];

  [self.progressIndicator startAnimation:nil];
  self.statusImageView.hidden = YES;
  [self setControlsEnabled:NO];
}

- (NSArray<NSToolbarItemIdentifier> *)toolbarAllowedItemIdentifiers:(NSToolbar *)toolbar {
  return @[
    NSToolbarFlexibleSpaceItemIdentifier,
    TrainTimerToolbarRefreshItemIdentifier,
    TrainTimerToolbarLogItemIdentifier
  ];
}

- (NSArray<NSToolbarItemIdentifier> *)toolbarDefaultItemIdentifiers:(NSToolbar *)toolbar {
  return @[
    NSToolbarFlexibleSpaceItemIdentifier,
    TrainTimerToolbarRefreshItemIdentifier,
    TrainTimerToolbarLogItemIdentifier
  ];
}

- (NSToolbarItem *)toolbar:(NSToolbar *)toolbar
     itemForItemIdentifier:(NSToolbarItemIdentifier)itemIdentifier
 willBeInsertedIntoToolbar:(BOOL)flag {
  NSToolbarItem *item = [[NSToolbarItem alloc] initWithItemIdentifier:itemIdentifier];
  if ([itemIdentifier isEqualToString:TrainTimerToolbarRefreshItemIdentifier]) {
    item.label = @"刷新";
    item.paletteLabel = @"刷新状态";
    item.toolTip = @"刷新服务状态 (⌘R)";
    item.image = [self symbolImageNamed:@"arrow.clockwise" description:@"刷新服务状态" pointSize:15.0];
    item.target = self;
    item.action = @selector(refreshStatus:);
    return item;
  }
  if ([itemIdentifier isEqualToString:TrainTimerToolbarLogItemIdentifier]) {
    item.label = @"日志";
    item.paletteLabel = @"显示日志";
    item.toolTip = @"在访达中显示日志 (⌥⌘L)";
    item.image = [self symbolImageNamed:@"doc.text.magnifyingglass" description:@"显示日志" pointSize:15.0];
    item.target = self;
    item.action = @selector(revealLog:);
    return item;
  }
  return nil;
}

- (BOOL)validateMenuItem:(NSMenuItem *)menuItem {
  SEL action = menuItem.action;
  if (action == @selector(performPrimaryAction:)) {
    if (self.running) {
      menuItem.title = TrainTimerChromeApplicationURL() ? @"在 Chrome 中打开" : @"在默认浏览器中打开";
      menuItem.image = [NSImage imageWithSystemSymbolName:@"globe" accessibilityDescription:menuItem.title];
    } else {
      menuItem.title = @"启动并打开 TrainTimer";
      menuItem.image = [NSImage imageWithSystemSymbolName:@"play.fill" accessibilityDescription:menuItem.title];
    }
    return !self.busy && !self.refreshInFlight && (self.running || self.nodePath.length > 0);
  }
  if (action == @selector(openWeb:)) return !self.busy && !self.refreshInFlight && self.running;
  if (action == @selector(stopService:)) return !self.busy && !self.refreshInFlight && self.running;
  if (action == @selector(restartService:)) return !self.busy && !self.refreshInFlight && self.running;
  if (action == @selector(refreshStatus:)) return !self.busy && !self.refreshInFlight;
  if (action == @selector(copyURL:)) return self.currentURL.length > 0;
  if (action == @selector(revealLog:)) return YES;
  return YES;
}

- (BOOL)validateToolbarItem:(NSToolbarItem *)item {
  if ([item.itemIdentifier isEqualToString:TrainTimerToolbarRefreshItemIdentifier]) {
    return !self.busy && !self.refreshInFlight;
  }
  return YES;
}

- (void)setStatusSymbol:(NSString *)symbol color:(NSColor *)color description:(NSString *)description {
  [self.progressIndicator stopAnimation:nil];
  self.progressIndicator.hidden = YES;
  self.statusImageView.hidden = NO;
  self.statusImageView.image = [self symbolImageNamed:symbol description:description pointSize:34.0];
  self.statusImageView.contentTintColor = color;
  self.statusImageView.accessibilityLabel = description;
}

- (void)updateLastCheck {
  NSString *time = [NSDateFormatter localizedStringFromDate:[NSDate date]
                                                   dateStyle:NSDateFormatterNoStyle
                                                   timeStyle:NSDateFormatterShortStyle];
  self.lastCheckField.stringValue = [NSString stringWithFormat:@"刚刚检查 · %@", time];
}

- (void)clearTransientFeedback {
  self.feedbackField.stringValue = @"";
  self.feedbackField.textColor = NSColor.secondaryLabelColor;
}

- (void)showTransientFeedback:(NSString *)message color:(NSColor *)color {
  [NSObject cancelPreviousPerformRequestsWithTarget:self selector:@selector(clearTransientFeedback) object:nil];
  self.feedbackField.stringValue = message ?: @"";
  self.feedbackField.textColor = color ?: NSColor.secondaryLabelColor;
  [self performSelector:@selector(clearTransientFeedback) withObject:nil afterDelay:3.0];
}

- (void)announceStatus:(NSString *)message priority:(NSAccessibilityPriorityLevel)priority {
  if (message.length == 0) return;
  NSAccessibilityPostNotificationWithUserInfo(
    NSApp,
    NSAccessibilityAnnouncementRequestedNotification,
    @{
      NSAccessibilityAnnouncementKey: message,
      NSAccessibilityPriorityKey: @(priority)
    }
  );
}

- (void)setControlsEnabled:(BOOL)enabled {
  BOOL ready = enabled && !self.busy && !self.refreshInFlight;
  BOOL canUsePrimary = ready && (self.running || self.nodePath.length > 0);
  self.primaryButton.enabled = canUsePrimary;
  self.stopButton.enabled = ready && self.running;
  self.restartButton.enabled = ready && self.running;
  self.urlCopyButton.enabled = self.currentURL.length > 0;

  if (!self.busy && !self.refreshInFlight) {
    if (self.running) {
      NSString *title = TrainTimerChromeApplicationURL() ? @"在 Chrome 中打开" : @"在默认浏览器中打开";
      self.primaryButton.title = title;
      self.primaryButton.image = [self symbolImageNamed:@"globe" description:title pointSize:15.0];
    } else {
      self.primaryButton.title = self.nodePath.length > 0 ? @"启动并打开" : @"需要 Node.js";
      self.primaryButton.image = [self symbolImageNamed:@"play.fill" description:@"启动并打开" pointSize:15.0];
    }
  }

  [self.window.toolbar validateVisibleItems];
  [NSApp.mainMenu update];
}

- (void)setBusyMessage:(NSString *)message {
  self.busy = YES;
  self.statusImageView.hidden = YES;
  self.progressIndicator.hidden = NO;
  [self.progressIndicator startAnimation:nil];
  if ([message containsString:@"重启"] || [message containsString:@"重新启动"]) {
    self.statusField.stringValue = @"正在重新启动";
    self.primaryButton.title = @"正在重新启动";
    self.progressIndicator.accessibilityLabel = @"正在重新启动本地服务";
  } else if ([message containsString:@"停止"]) {
    self.statusField.stringValue = @"正在停止服务";
    self.primaryButton.title = @"正在停止";
    self.progressIndicator.accessibilityLabel = @"正在停止本地服务";
  } else {
    self.statusField.stringValue = @"正在启动 TrainTimer";
    self.primaryButton.title = @"正在启动";
    self.progressIndicator.accessibilityLabel = @"正在启动本地服务";
  }
  self.messageField.stringValue = message;
  [self clearTransientFeedback];
  self.lastCheckField.stringValue = @"正在更新服务状态";
  [self setControlsEnabled:NO];
  [self announceStatus:self.statusField.stringValue priority:NSAccessibilityPriorityMedium];
}

- (void)showRunning {
  BOOL shouldAnnounce = !self.running || self.busy;
  self.running = YES;
  self.busy = NO;
  self.statusField.stringValue = @"TrainTimer 已就绪";
  self.urlField.stringValue = self.currentURL;
  self.messageField.stringValue = @"本地服务正在运行，可以开始计时。";
  self.browserField.stringValue = TrainTimerChromeApplicationURL() ? @"Google Chrome · 启动后自动打开" : @"默认浏览器 · 未检测到 Google Chrome";
  [self setStatusSymbol:@"checkmark.circle.fill" color:NSColor.systemGreenColor description:@"服务状态，运行中"];
  [self updateLastCheck];
  [self setControlsEnabled:YES];
  if (shouldAnnounce) [self announceStatus:@"TrainTimer 已就绪" priority:NSAccessibilityPriorityHigh];
}

- (void)showStoppedWithMessage:(NSString *)message {
  BOOL shouldAnnounce = self.running || self.busy;
  if (shouldAnnounce) [self clearTransientFeedback];
  self.running = NO;
  self.busy = NO;
  NSString *displayMessage = message ?: @"本地服务未运行。";
  BOOL missingNode = [displayMessage containsString:@"Node.js"];
  BOOL isError = missingNode || [displayMessage containsString:@"失败"] || [displayMessage containsString:@"超时"] || [displayMessage containsString:@"没有可用端口"];
  if (missingNode) {
    self.statusField.stringValue = @"需要 Node.js";
  } else if (isError) {
    self.statusField.stringValue = @"启动遇到问题";
  } else {
    self.statusField.stringValue = @"TrainTimer 已停止";
  }
  self.urlField.stringValue = self.currentURL;
  self.messageField.stringValue = displayMessage;
  if (isError) {
    [self setStatusSymbol:@"exclamationmark.triangle.fill" color:NSColor.systemRedColor description:@"服务状态，出现错误"];
  } else {
    [self setStatusSymbol:@"pause.circle.fill" color:NSColor.secondaryLabelColor description:@"服务状态，已停止"];
  }
  [self updateLastCheck];
  [self setControlsEnabled:YES];
  if (shouldAnnounce) [self announceStatus:self.statusField.stringValue priority:(isError ? NSAccessibilityPriorityHigh : NSAccessibilityPriorityMedium)];
}

- (void)performPrimaryAction:(id)sender {
  if (self.busy || self.refreshInFlight) return;
  if (self.running) {
    [self openWeb:sender];
  } else {
    [self startService:sender];
  }
}

- (void)copyURL:(id)sender {
  if (self.currentURL.length == 0) return;
  NSPasteboard *pasteboard = NSPasteboard.generalPasteboard;
  [pasteboard clearContents];
  [pasteboard writeObjects:@[self.currentURL]];
  [self showTransientFeedback:@"网页地址已复制" color:NSColor.secondaryLabelColor];
}

- (void)revealLog:(id)sender {
  TrainTimerEnsureStateDirectory();
  NSString *logPath = [TrainTimerStateDirectory() stringByAppendingPathComponent:@"launcher.log"];
  if (![[NSFileManager defaultManager] fileExistsAtPath:logPath]) {
    [[NSFileManager defaultManager] createFileAtPath:logPath contents:[NSData data] attributes:nil];
  }
  [[NSWorkspace sharedWorkspace] activateFileViewerSelectingURLs:@[[NSURL fileURLWithPath:logPath]]];
}

- (void)startService:(id)sender {
  [self startServiceOpeningBrowser:YES];
}

- (void)startServiceOpeningBrowser:(BOOL)shouldOpenBrowser {
  if (self.busy || self.refreshInFlight || self.terminating) return;
  NSInteger basePort = TrainTimerPortInteger(self.basePort, 3211);
  NSInteger endPort = TrainTimerManagedPortEnd(basePort);
  NSString *healthyURL = TrainTimerFindHealthyServiceURL(self.host, basePort, endPort);
  if (healthyURL.length > 0) {
    self.currentURL = healthyURL;
    self.port = [NSString stringWithFormat:@"%ld", (long)TrainTimerURLPort(healthyURL, basePort)];
    [self showRunning];
    if (shouldOpenBrowser) [self openWeb:nil];
    return;
  }
  if (self.nodePath.length == 0) {
    [self showStoppedWithMessage:@"找不到 Node.js。请先安装 Node.js 18 或更高版本。"];
    return;
  }

  if (shouldOpenBrowser) TrainTimerPrewarmChrome();
  NSString *startupMessage = nil;
  if (!shouldOpenBrowser) {
    startupMessage = @"正在重新启动本地服务。";
  } else if (TrainTimerChromeApplicationURL()) {
    startupMessage = @"正在准备本地服务。就绪后会自动在 Chrome 中打开。";
  } else {
    startupMessage = @"正在准备本地服务。就绪后会自动在默认浏览器中打开。";
  }
  [self setBusyMessage:startupMessage];
  NSString *nodePath = self.nodePath;
  NSString *projectRoot = self.projectRoot;
  NSString *host = self.host;
  NSString *basePortText = self.basePort;

  dispatch_group_async(self.startupGroup, dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    if (self.terminating) return;
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

    if (self.terminating) return;

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
    self.serverPid = spawnedPid;
    if (self.terminating) {
      TrainTimerTerminatePid(spawnedPid, 1.0);
      self.serverPid = 0;
      return;
    }

    BOOL healthy = NO;
    NSString *actualURL = currentURL;
    for (NSUInteger attempt = 0; attempt < 120; attempt++) {
      if (self.terminating) break;
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

    if (self.terminating) {
      TrainTimerTerminatePid(spawnedPid, 1.0);
      self.serverPid = 0;
      return;
    }

    dispatch_async(dispatch_get_main_queue(), ^{
      if (self.terminating) {
        TrainTimerTerminatePid(spawnedPid, 1.0);
        self.serverPid = 0;
        return;
      }
      if (healthy) {
        self.currentURL = actualURL;
        self.port = [NSString stringWithFormat:@"%ld", (long)TrainTimerURLPort(actualURL, selectedPort)];
        self.serverPid = spawnedPid;
        [self showRunning];
        if (shouldOpenBrowser) [self openWeb:nil];
      } else {
        TrainTimerAppendLog(@"Direct service did not become healthy");
        TrainTimerTerminatePid(spawnedPid, 1.0);
        self.serverPid = 0;
        [self showStoppedWithMessage:@"启动失败或超时。请查看日志。"];
      }
    });
  });
}

- (void)openWeb:(id)sender {
  NSURL *url = [NSURL URLWithString:self.currentURL];
  TrainTimerOpenURLPreferChrome(url, ^(BOOL opened, BOOL usedChrome, NSError *error) {
    dispatch_async(dispatch_get_main_queue(), ^{
      if (opened && usedChrome) {
        self.browserField.stringValue = @"Google Chrome · 已打开";
        [self showTransientFeedback:@"已在 Chrome 中打开" color:NSColor.secondaryLabelColor];
      } else if (opened) {
        self.browserField.stringValue = @"默认浏览器 · 已打开";
        [self showTransientFeedback:@"未找到 Chrome，已改用默认浏览器" color:NSColor.systemOrangeColor];
      } else {
        NSString *failure = error.localizedDescription.length > 0 ? @"无法在 Chrome 中打开，请重试或复制地址" : @"无法自动打开网页，请重试或复制地址";
        [self showTransientFeedback:failure color:NSColor.systemRedColor];
      }
    });
  });
}

- (void)stopService:(id)sender {
  if (self.busy || self.refreshInFlight) return;
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
      TrainTimerAppendLog([NSString stringWithFormat:@"Stopped %lu managed TrainTimer service(s)", (unsigned long)stopped]);
      [self showStoppedWithMessage:@"服务已安全停止。再次启动时会自动打开网页。"];
    });
  });
}

- (void)restartService:(id)sender {
  if (self.busy || self.refreshInFlight) return;
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
      self.busy = NO;
      [self startServiceOpeningBrowser:NO];
    });
  });
}

- (void)refreshStatus:(id)sender {
  if (self.busy || self.refreshInFlight) return;
  self.refreshInFlight = YES;
  [self setControlsEnabled:NO];

  dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
    NSInteger basePort = TrainTimerPortInteger(self.basePort, 3211);
    NSInteger endPort = TrainTimerManagedPortEnd(basePort);
    NSString *healthyURL = TrainTimerFindHealthyServiceURL(self.host, basePort, endPort);
    dispatch_async(dispatch_get_main_queue(), ^{
      self.refreshInFlight = NO;
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
