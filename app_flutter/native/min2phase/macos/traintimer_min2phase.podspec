Pod::Spec.new do |s|
  s.name = 'traintimer_min2phase'
  s.version = '0.1.0'
  s.summary = 'Offline current-to-target 3x3 solver.'
  s.description = 'Fixed min2phaseCXX commit with portability patch and a verified C ABI.'
  s.homepage = 'https://github.com/lilborgo/min2phaseCXX'
  s.license = { :type => 'GPL-3.0-or-later', :file => 'Resources/LICENSE' }
  s.author = { 'TrainTimer' => 'https://github.com/lilborgo/min2phaseCXX' }
  s.source = { :path => '.' }
  # CocoaPods scopes source globs to this pod root. Thin local translation units
  # include the canonical implementation so all backends share one code source.
  s.source_files = 'Classes/**/*.cpp'
  s.module_name = 'traintimer_min2phase'
  s.static_framework = false
  s.resources = ['Resources/LICENSE', 'Resources/NOTICE']
  s.preserve_paths = ['Resources/LICENSE', 'Resources/NOTICE']
  s.dependency 'FlutterMacOS'
  s.platform = :osx, '12.0'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++14',
    'GCC_PREPROCESSOR_DEFINITIONS' => '$(inherited) TT_M2P_BUILD=1',
    'HEADER_SEARCH_PATHS' => '$(inherited) "${PODS_TARGET_SRCROOT}/../include" "${PODS_TARGET_SRCROOT}/../vendor/src" "${PODS_TARGET_SRCROOT}/../vendor/include"',
    'GCC_SYMBOLS_PRIVATE_EXTERN' => 'YES'
  }
end
