import Cocoa
import CoreBluetooth
import FlutterMacOS
import IOKit.pwr_mgt

class MainFlutterWindow: NSWindow {
  private var platformBridge: MacPlatformBridge?
  private var bluetoothBridge: MacBleTransport?

  override func awakeFromNib() {
    let flutterViewController = FlutterViewController()
    let windowFrame = self.frame
    self.contentViewController = flutterViewController
    self.setFrame(windowFrame, display: true)

    RegisterGeneratedPlugins(registry: flutterViewController)
    platformBridge = MacPlatformBridge(window: self, messenger: flutterViewController.engine.binaryMessenger)
    bluetoothBridge = MacBleTransport(messenger: flutterViewController.engine.binaryMessenger)

    super.awakeFromNib()
  }

  func interceptTermination() -> Bool {
    platformBridge?.requestCloseIfNeeded() ?? false
  }
}

/// Window visibility, real system sleep and idle sleep prevention have separate
/// meanings. Losing focus never interrupts timing or suspends visible drawing.
private final class MacPlatformBridge: NSObject, NSWindowDelegate {
  private weak var window: NSWindow?
  private let channel: FlutterMethodChannel
  private var observers: [NSObjectProtocol] = []
  private var sleepObserver: NSObjectProtocol?
  private var assertion: IOPMAssertionID = 0
  private var preventClose = false
  private var closeRequestPending = false
  private var lastVisibility: Bool?

  init(window: NSWindow, messenger: FlutterBinaryMessenger) {
    self.window = window
    channel = FlutterMethodChannel(name: "dev.traintimer/platform", binaryMessenger: messenger)
    super.init()
    window.delegate = self
    channel.setMethodCallHandler { [weak self] call, result in
      guard let self = self else { result(nil); return }
      switch call.method {
      case "setKeepAwake":
        guard let enabled = call.arguments as? Bool else {
          result(FlutterError(code: "invalid_argument", message: "Expected a boolean", details: nil)); return
        }
        let status = self.setKeepAwake(enabled)
        result(status == kIOReturnSuccess ? nil : FlutterError(code: "power_assertion", message: "Unable to update idle-sleep assertion", details: Int(status)))
      case "setPreventClose":
        guard let enabled = call.arguments as? Bool else {
          result(FlutterError(code: "invalid_argument", message: "Expected a boolean", details: nil)); return
        }
        self.preventClose = enabled
        if !enabled { self.closeRequestPending = false }
        result(nil)
      case "closeApproved":
        self.preventClose = false
        self.closeRequestPending = false
        _ = self.setKeepAwake(false)
        result(nil)
        DispatchQueue.main.async { [weak self] in self?.window?.performClose(nil) }
      default: result(FlutterMethodNotImplemented)
      }
    }
    let center = NotificationCenter.default
    for name in [NSWindow.didMiniaturizeNotification, NSWindow.didDeminiaturizeNotification,
                 NSWindow.didChangeOcclusionStateNotification] {
      observers.append(center.addObserver(forName: name, object: window, queue: .main) { [weak self] _ in
        self?.publishVisibility()
      })
    }
    // App hide/unhide changes window visibility independently of keyboard focus.
    for name in [NSApplication.didHideNotification, NSApplication.didUnhideNotification,
                 NSApplication.didChangeOcclusionStateNotification] {
      observers.append(center.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
        self?.publishVisibility()
      })
    }
    sleepObserver = NSWorkspace.shared.notificationCenter.addObserver(
      forName: NSWorkspace.willSleepNotification, object: nil, queue: .main
    ) { [weak self] _ in self?.channel.invokeMethod("systemSleep", arguments: nil) }
    DispatchQueue.main.async { [weak self] in self?.publishVisibility() }
  }

  deinit {
    for observer in observers { NotificationCenter.default.removeObserver(observer) }
    if let observer = sleepObserver { NSWorkspace.shared.notificationCenter.removeObserver(observer) }
    if assertion != 0 { IOPMAssertionRelease(assertion) }
    channel.setMethodCallHandler(nil)
  }

  private func setKeepAwake(_ enabled: Bool) -> IOReturn {
    if enabled {
      if assertion != 0 { return kIOReturnSuccess }
      var created: IOPMAssertionID = 0
      // Prevent only idle-triggered display/system sleep; an explicit system
      // sleep is still allowed and produces willSleep above.
      let status = IOPMAssertionCreateWithName(kIOPMAssertionTypePreventUserIdleDisplaySleep as CFString,
        IOPMAssertionLevel(kIOPMAssertionLevelOn), "TrainTimer active inspection or solve" as CFString, &created)
      if status == kIOReturnSuccess { assertion = created }
      return status
    }
    if assertion == 0 { return kIOReturnSuccess }
    let status = IOPMAssertionRelease(assertion)
    if status == kIOReturnSuccess { assertion = 0 }
    return status
  }

  private func publishVisibility() {
    guard let window = window else { return }
    let visible = window.isVisible && !window.isMiniaturized && !NSApp.isHidden
      && window.occlusionState.contains(.visible)
    if visible != lastVisibility {
      lastVisibility = visible
      channel.invokeMethod("visibilityChanged", arguments: visible)
    }
  }

  func requestCloseIfNeeded() -> Bool {
    guard preventClose else { return false }
    if !closeRequestPending {
      closeRequestPending = true
      channel.invokeMethod("requestClose", arguments: nil) { [weak self] _ in
        // A cancelled Flutter dialog must allow the next close attempt.
        self?.closeRequestPending = false
      }
    }
    return true
  }

  func windowShouldClose(_ sender: NSWindow) -> Bool { !requestCloseIfNeeded() }

  func windowWillClose(_ notification: Notification) {
    _ = setKeepAwake(false)
  }
}

/// Raw CoreBluetooth transport only. GAN handshake, decryption, sequence numbers
/// and device clocks belong to Dart's protocol layer. No MAC address is inferred.
private final class MacBleTransport: NSObject, CBCentralManagerDelegate, FlutterStreamHandler {
  private enum Operation { case connect, disconnect, discover, subscribe, read, write }
  private struct Request {
    let token = UUID()
    let epoch: UUID
    let operation: Operation
    let key: String?
    let notifyEnabled: Bool
    let result: FlutterResult
  }
  private struct DeferredWrite {
    let token: UUID
    let epoch: UUID
    let characteristic: CBCharacteristic
    let bytes: Data
    let waited: Bool
  }

  /// Each peripheral delegate belongs to one connection epoch. Retired callbacks
  /// cannot be interpreted as replies to a new request with matching UUIDs.
  private final class PeripheralEvents: NSObject, CBPeripheralDelegate {
    private weak var owner: MacBleTransport?
    let epoch: UUID

    init(owner: MacBleTransport, epoch: UUID) {
      self.owner = owner
      self.epoch = epoch
    }

    private func deliver(_ peripheral: CBPeripheral, _ body: (MacBleTransport) -> Void) {
      guard let owner = owner, owner.owns(peripheral, epoch: epoch) else { return }
      body(owner)
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
      deliver(peripheral) { $0.peripheral(peripheral, didDiscoverServices: error) }
    }
    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
      deliver(peripheral) { $0.peripheral(peripheral, didDiscoverCharacteristicsFor: service, error: error) }
    }
    func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
      deliver(peripheral) { $0.peripheral(peripheral, didUpdateNotificationStateFor: characteristic, error: error) }
    }
    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
      deliver(peripheral) { $0.peripheral(peripheral, didUpdateValueFor: characteristic, error: error) }
    }
    func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
      deliver(peripheral) { $0.peripheral(peripheral, didWriteValueFor: characteristic, error: error) }
    }
    func peripheral(_ peripheral: CBPeripheral, didModifyServices invalidatedServices: [CBService]) {
      deliver(peripheral) { $0.peripheral(peripheral, didModifyServices: invalidatedServices) }
    }
    func peripheralIsReady(toSendWriteWithoutResponse peripheral: CBPeripheral) {
      deliver(peripheral) { $0.peripheralIsReady(toSendWriteWithoutResponse: peripheral) }
    }
  }

  private let methods: FlutterMethodChannel
  private let events: FlutterEventChannel
  private var sink: FlutterEventSink?
  private var central: CBCentralManager?
  private var peripherals: [UUID: CBPeripheral] = [:]
  private var active: CBPeripheral?
  private var connectionEpoch = UUID()
  private var peripheralEvents: PeripheralEvents?
  private var characteristics: [String: CBCharacteristic] = [:]
  private var discovering: Set<ObjectIdentifier> = []
  private var request: Request?
  private var deadline: DispatchWorkItem?
  private var permissionResult: FlutterResult?
  private var permissionDeadline: DispatchWorkItem?
  private var permissionToken: UUID?
  private var stateCallbackCount = 0
  private var manualDisconnect = false
  private var deferredWrite: DeferredWrite?
  private var writeWaitCount = 0, writeReadyCount = 0, writeQueuedCount = 0, writeClearCount = 0
  private var writeDiagnostics: [[String: Any]] = []

  init(messenger: FlutterBinaryMessenger) {
    methods = FlutterMethodChannel(name: "dev.traintimer/ble", binaryMessenger: messenger)
    events = FlutterEventChannel(name: "dev.traintimer/ble/events", binaryMessenger: messenger)
    super.init()
    methods.setMethodCallHandler { [weak self] call, result in
      guard let self = self else { result(FlutterError(code: "disposed", message: "Transport disposed", details: nil)); return }
      self.handle(call, result: result)
    }
    events.setStreamHandler(self)
  }

  deinit {
    deadline?.cancel()
    permissionDeadline?.cancel()
    stopScanning()
    central?.delegate = nil
    active?.delegate = nil
    if let peripheral = active { central?.cancelPeripheralConnection(peripheral) }
    methods.setMethodCallHandler(nil)
    events.setStreamHandler(nil)
  }

  func onListen(withArguments arguments: Any?, eventSink events: @escaping FlutterEventSink) -> FlutterError? {
    sink = events
    publishState()
    return nil
  }

  func onCancel(withArguments arguments: Any?) -> FlutterError? {
    sink = nil
    stopScanning()
    return nil
  }

  private func emit(_ type: String, _ values: [String: Any] = [:]) {
    var event = values
    event["type"] = type
    sink?(event)
  }

  private func error(_ code: String, _ message: String) -> FlutterError {
    FlutterError(code: code, message: message, details: nil)
  }

  private func reject(_ result: FlutterResult, _ code: String, _ message: String) {
    result(error(code, message))
    emit("error", ["code": code, "message": message])
  }

  private var permission: String {
    switch CBManager.authorization {
    case .allowedAlways: return "granted"
    case .denied: return "denied"
    case .restricted: return "restricted"
    case .notDetermined: return "undetermined"
    @unknown default: return "unavailable"
    }
  }

  private func ensureCentral() -> CBCentralManager {
    if let manager = central { return manager }
    NSLog("TrainTimer BLE central.initialize.begin")
    let manager = CBCentralManager(delegate: self, queue: .main,
      options: [CBCentralManagerOptionShowPowerAlertKey: false])
    central = manager
    traceWrite("central.initialized", "CoreBluetooth manager initialization returned")
    return manager
  }

  private var adapterState: String {
    switch central?.state ?? .unknown {
    case .unknown: return "unknown"
    case .resetting: return "resetting"
    case .unsupported: return "unsupported"
    case .unauthorized: return "unauthorized"
    case .poweredOff: return "poweredOff"
    case .poweredOn: return "poweredOn"
    @unknown default: return "unknown"
    }
  }

  private func publishState() {
    emit("state", ["state": adapterState, "permission": permission])
  }

  private func stopScanning() {
    if let manager = central, manager.state == .poweredOn && manager.isScanning { manager.stopScan() }
  }

  @discardableResult
  private func completePermissionIfReady() -> Bool {
    guard let result = permissionResult, let manager = central,
          manager.state != .unknown && manager.state != .resetting,
          permission != "undetermined" || manager.state == .unsupported else { return false }
    permissionResult = nil
    permissionToken = nil
    permissionDeadline?.cancel()
    permissionDeadline = nil
    traceWrite("permission.completed", "Adapter state and authorization are available")
    result(manager.state == .unsupported ? "unavailable" : permission)
    return true
  }

  private func begin(_ operation: Operation, result: @escaping FlutterResult,
                     key: String? = nil, notifyEnabled: Bool = true) -> Bool {
    guard request == nil else { reject(result, "busy", "A Bluetooth operation is already pending"); return false }
    let pending = Request(epoch: connectionEpoch, operation: operation, key: key, notifyEnabled: notifyEnabled, result: result)
    request = pending
    let work = DispatchWorkItem { [weak self] in
      guard let self = self, self.request?.token == pending.token else { return }
      self.failPending("timeout", "Bluetooth operation timed out", cancelConnection: true)
    }
    deadline = work
    DispatchQueue.main.asyncAfter(deadline: .now() + (operation == .connect ? 20 : 10), execute: work)
    return true
  }

  private func finish(_ value: Any? = nil) {
    clearDeferredWrite(reason: "request_finished")
    let pending = request
    request = nil
    deadline?.cancel()
    deadline = nil
    pending?.result(value)
  }

  private func failPending(_ code: String, _ message: String, cancelConnection: Bool = false) {
    // Clear ownership before completing the Future. A timed-out disconnect must
    // not leave an active peripheral that keeps every later connect busy.
    clearDeferredWrite(reason: code)
    let pending = request
    request = nil
    deadline?.cancel()
    deadline = nil
    if cancelConnection { retireConnection(reason: code) }
    pending?.result(error(code, message))
    emit("error", ["code": code, "message": message])
  }

  private func owns(_ peripheral: CBPeripheral, epoch: UUID) -> Bool {
    active === peripheral && connectionEpoch == epoch && peripheralEvents?.epoch == epoch
  }

  private func retireConnection(reason: String) {
    clearDeferredWrite(reason: "retire_\(reason)")
    let retiredManager = central
    retiredManager?.delegate = nil
    if let manager = retiredManager, manager.state == .poweredOn && manager.isScanning { manager.stopScan() }
    if let peripheral = active {
      clearConnection(peripheral, reason: reason)
      retiredManager?.cancelPeripheralConnection(peripheral)
    }
    // A CBPeripheral can be reused by a manager. Retiring that manager as well
    // gives late central callbacks a different identity from the next attempt.
    peripherals.removeAll()
    central = nil
    _ = ensureCentral()
  }

  private func traceWrite(_ code: String, _ message: String) {
    let record: [String: Any] = ["code": code, "message": message,
      "pending": deferredWrite == nil ? 0 : 1, "waits": writeWaitCount,
      "readyCallbacks": writeReadyCount, "queued": writeQueuedCount,
      "cleared": writeClearCount, "uptimeMs": Int(ProcessInfo.processInfo.systemUptime * 1000),
      "state": adapterState, "authorization": permission, "initialized": central != nil,
      "scanning": central?.isScanning ?? false, "stateCallbacks": stateCallbackCount]
    if writeDiagnostics.count == 32 { writeDiagnostics.removeFirst() }
    writeDiagnostics.append(record)
    emit("diagnostic", record)
    NSLog("TrainTimer BLE %@: %@ (state=%@ auth=%@ initialized=%d scanning=%d pending=%d waits=%d ready=%d queued=%d cleared=%d)",
      code, message, adapterState, permission, central == nil ? 0 : 1, central?.isScanning == true ? 1 : 0,
      deferredWrite == nil ? 0 : 1, writeWaitCount, writeReadyCount, writeQueuedCount, writeClearCount)
  }

  private func clearDeferredWrite(reason: String) {
    guard deferredWrite != nil else { return }
    deferredWrite = nil
    writeClearCount += 1
    traceWrite("write.cleared", reason)
  }

  private func flushDeferredWrite(_ peripheral: CBPeripheral) {
    guard let deferred = deferredWrite else { return }
    guard owns(peripheral, epoch: deferred.epoch), request?.token == deferred.token,
          request?.epoch == deferred.epoch, request?.operation == .write else {
      clearDeferredWrite(reason: "stale_connection_or_request"); return
    }
    guard peripheral.canSendWriteWithoutResponse else { return }
    // Remove the slot before completing the Future, so the caller can submit
    // the next command. Completion means queued by CoreBluetooth, not delivered.
    deferredWrite = nil
    peripheral.writeValue(deferred.bytes, for: deferred.characteristic, type: .withoutResponse)
    writeQueuedCount += 1
    if deferred.waited { traceWrite("write.queued", "Queued after readiness callback; no delivery acknowledgement") }
    finish()
  }

  func peripheralIsReady(toSendWriteWithoutResponse peripheral: CBPeripheral) {
    guard owns(peripheral, epoch: connectionEpoch) else { return }
    writeReadyCount += 1
    if deferredWrite != nil {
      traceWrite("write.ready", peripheral.canSendWriteWithoutResponse ? "Write capacity available" : "Callback received but capacity still unavailable")
      flushDeferredWrite(peripheral)
    }
  }

  private func uuid(_ text: String?) -> CBUUID? {
    guard let text = text else { return nil }
    if UUID(uuidString: text) != nil { return CBUUID(string: text) }
    guard (text.count == 4 || text.count == 8), text.allSatisfy({ $0.isHexDigit }) else { return nil }
    return CBUUID(string: text)
  }

  private func key(_ characteristic: CBCharacteristic) -> String {
    "\(characteristic.service?.uuid.uuidString ?? "")/\(characteristic.uuid.uuidString)"
  }

  private func selected(_ arguments: [String: Any], result: FlutterResult) -> CBCharacteristic? {
    guard let service = uuid(arguments["service"] as? String),
          let characteristic = uuid(arguments["characteristic"] as? String) else {
      reject(result, "invalid_argument", "Expected service and characteristic UUIDs"); return nil
    }
    guard let value = characteristics["\(service.uuidString)/\(characteristic.uuidString)"] else {
      reject(result, "not_discovered", "Discover the requested characteristic first"); return nil
    }
    return value
  }

  private func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    let arguments = call.arguments as? [String: Any] ?? [:]
    if call.method == "diagnostics" {
      result(["pendingWriteCount": deferredWrite == nil ? 0 : 1, "writeWaiting": writeWaitCount,
        "writeReadyCallbacks": writeReadyCount, "writeQueued": writeQueuedCount,
        "writeCleared": writeClearCount, "recent": writeDiagnostics,
        "state": adapterState, "authorization": permission, "scanning": central?.isScanning ?? false,
        "initialized": central != nil, "permissionPending": permissionResult != nil, "stateCallbacks": stateCallbackCount])
      return
    }
    if call.method == "permission" {
      let manager = ensureCentral()
      if manager.state == .unsupported { result("unavailable") }
      else if permission != "undetermined" && manager.state != .unknown && manager.state != .resetting { result(permission) }
      else if permissionResult != nil { reject(result, "busy", "Permission request is pending") }
      else {
        permissionResult = result
        let token = UUID()
        permissionToken = token
        traceWrite("permission.waiting", "Waiting up to 8 seconds for adapter state or authorization")
        let work = DispatchWorkItem { [weak self] in
          guard let self = self, self.permissionToken == token else { return }
          if self.completePermissionIfReady() { return }
          let pending = self.permissionResult
          self.permissionResult = nil
          self.permissionToken = nil
          self.permissionDeadline = nil
          let message = "Bluetooth initialization timed out (state=\(self.adapterState), authorization=\(self.permission), stateCallbacks=\(self.stateCallbackCount))"
          self.traceWrite("permission.timeout", message)
          pending?(self.error("permission_timeout", message))
          self.emit("error", ["code": "permission_timeout", "message": message])
        }
        permissionDeadline = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 8, execute: work)
        // Re-read after installing the waiter as well as on callbacks/deadline.
        // This handles state that settled around manager initialization.
        completePermissionIfReady()
      }
      return
    }
    if call.method == "stopScan" { stopScanning(); result(nil); return }
    if call.method == "disconnect" {
      stopScanning()
      clearDeferredWrite(reason: "disconnect_requested")
      guard let peripheral = active else { result(nil); return }
      manualDisconnect = true
      if request != nil { finish(error("cancelled", "Bluetooth operation cancelled by disconnect")) }
      if peripheral.state == .disconnected {
        clearConnection(peripheral, reason: nil)
        result(nil)
      } else if begin(.disconnect, result: result) { central?.cancelPeripheralConnection(peripheral) }
      return
    }
    let manager = ensureCentral()
    guard manager.state == .poweredOn else {
      reject(result, "not_ready", "Bluetooth must be authorized and powered on"); return
    }
    switch call.method {
    case "startScan":
      var filters: [CBUUID]?
      if let values = arguments["services"] as? [String] {
        let parsed = values.compactMap { uuid($0) }
        guard parsed.count == values.count else { reject(result, "invalid_argument", "Invalid scan service UUID"); return }
        if !parsed.isEmpty { filters = parsed }
      }
      manager.scanForPeripherals(withServices: filters, options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
      result(nil)
    case "connect":
      guard let text = arguments["id"] as? String, let identifier = UUID(uuidString: text) else {
        reject(result, "invalid_argument", "Expected a CoreBluetooth peripheral identifier"); return
      }
      if let peripheral = active {
        if peripheral.identifier == identifier && peripheral.state == .connected { result(nil) }
        else { reject(result, "busy", "Disconnect the current peripheral first") }
        return
      }
      guard let peripheral = peripherals[identifier] ?? manager.retrievePeripherals(withIdentifiers: [identifier]).first else {
        reject(result, "not_found", "Peripheral unavailable; scan again"); return
      }
      connectionEpoch = UUID()
      guard begin(.connect, result: result) else { return }
      manualDisconnect = false
      active = peripheral
      let callbacks = PeripheralEvents(owner: self, epoch: connectionEpoch)
      peripheralEvents = callbacks
      peripheral.delegate = callbacks
      stopScanning()
      manager.connect(peripheral, options: nil)
    case "discover", "subscribe", "read", "write":
      guard let peripheral = active, peripheral.state == .connected else {
        reject(result, "not_connected", "Connect a peripheral first"); return
      }
      if call.method == "discover" {
        guard begin(.discover, result: result) else { return }
        characteristics.removeAll()
        discovering.removeAll()
        peripheral.discoverServices(nil)
        return
      }
      guard let characteristic = selected(arguments, result: result) else { return }
      let properties = characteristic.properties
      switch call.method {
      case "subscribe":
        guard properties.contains(.notify) || properties.contains(.indicate) else {
          reject(result, "unsupported", "Characteristic does not support notifications"); return
        }
        let enabled = arguments["enabled"] as? Bool ?? true
        guard begin(.subscribe, result: result, key: key(characteristic), notifyEnabled: enabled) else { return }
        if characteristic.isNotifying == enabled { finish(); return }
        peripheral.setNotifyValue(enabled, for: characteristic)
      case "read":
        guard properties.contains(.read) else { reject(result, "unsupported", "Characteristic is not readable"); return }
        guard !characteristic.isNotifying else {
          reject(result, "ambiguous_read", "Unsubscribe before reading; CoreBluetooth shares the read and notification callback"); return
        }
        guard begin(.read, result: result, key: key(characteristic)) else { return }
        peripheral.readValue(for: characteristic)
      default:
        guard let bytes = arguments["bytes"] as? FlutterStandardTypedData else {
          reject(result, "invalid_argument", "Expected Uint8List bytes"); return
        }
        let withResponse = arguments["response"] as? Bool ?? true
        let type: CBCharacteristicWriteType = withResponse ? .withResponse : .withoutResponse
        guard properties.contains(withResponse ? .write : .writeWithoutResponse) else {
          reject(result, "unsupported", "Requested write mode is unsupported"); return
        }
        guard bytes.data.count <= peripheral.maximumWriteValueLength(for: type) else {
          reject(result, "payload_too_large", "Payload exceeds this connection's write limit"); return
        }
        guard begin(.write, result: result, key: key(characteristic)) else { return }
        if withResponse {
          peripheral.writeValue(bytes.data, for: characteristic, type: type)
        } else if let pending = request {
          let waiting = !peripheral.canSendWriteWithoutResponse
          deferredWrite = DeferredWrite(token: pending.token, epoch: pending.epoch,
            characteristic: characteristic, bytes: Data(bytes.data), waited: waiting)
          if waiting {
            writeWaitCount += 1
            traceWrite("write.waiting", "Waiting for CoreBluetooth readiness; deadline 10 seconds")
          }
          flushDeferredWrite(peripheral)
        }
      }
    default: result(FlutterMethodNotImplemented)
    }
  }

  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    guard central === self.central else { return }
    stateCallbackCount += 1
    traceWrite("central.state", "CoreBluetooth state callback")
    publishState()
    completePermissionIfReady()
    if central.state != .poweredOn {
      if request != nil { failPending("adapter_state", "Bluetooth adapter is no longer ready") }
      if let peripheral = active { clearConnection(peripheral, reason: "adapter_state") }
      peripherals.removeAll()
    }
  }

  func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
                      advertisementData: [String: Any], rssi RSSI: NSNumber) {
    guard central === self.central else { return }
    if peripherals.count >= 128 && peripherals[peripheral.identifier] == nil,
       let removable = peripherals.keys.first(where: { $0 != active?.identifier }) {
      peripherals.removeValue(forKey: removable)
    }
    peripherals[peripheral.identifier] = peripheral
    var value: [String: Any] = ["id": peripheral.identifier.uuidString,
      "name": advertisementData[CBAdvertisementDataLocalNameKey] as? String ?? peripheral.name ?? "Unknown device",
      "rssi": RSSI.intValue,
      "services": (advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID] ?? []).map { $0.uuidString }]
    if let bytes = advertisementData[CBAdvertisementDataManufacturerDataKey] as? Data {
      value["manufacturerData"] = FlutterStandardTypedData(bytes: bytes)
    }
    emit("discovered", value)
  }

  func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    guard central === self.central else { return }
    guard owns(peripheral, epoch: connectionEpoch), request?.operation == .connect,
          request?.epoch == connectionEpoch else {
      central.cancelPeripheralConnection(peripheral); return
    }
    emit("connected", ["id": peripheral.identifier.uuidString])
    finish()
  }

  func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
    guard central === self.central, owns(peripheral, epoch: connectionEpoch) else { return }
    failPending("connect_failed", error?.localizedDescription ?? "Connection failed")
    clearConnection(peripheral, reason: error?.localizedDescription ?? "connect_failed")
  }

  func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
    guard central === self.central, owns(peripheral, epoch: connectionEpoch) else { return }
    if request?.operation == .disconnect { finish() }
    else if request != nil { failPending("disconnected", error?.localizedDescription ?? "Peripheral disconnected") }
    clearConnection(peripheral, reason: error?.localizedDescription)
  }

  private func clearConnection(_ peripheral: CBPeripheral, reason: String?) {
    guard active === peripheral else { return }
    clearDeferredWrite(reason: reason ?? "disconnected")
    peripheral.delegate = nil
    peripheralEvents = nil
    active = nil
    connectionEpoch = UUID()
    characteristics.removeAll()
    discovering.removeAll()
    emit("disconnected", ["id": peripheral.identifier.uuidString, "requested": manualDisconnect, "reason": reason ?? ""])
  }

  func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    guard active === peripheral, request?.operation == .discover else { return }
    if let error = error { failPending("discovery_failed", error.localizedDescription, cancelConnection: true); return }
    let services = peripheral.services ?? []
    discovering = Set(services.map { ObjectIdentifier($0) })
    if services.isEmpty { finishDiscovery(peripheral); return }
    for service in services { peripheral.discoverCharacteristics(nil, for: service) }
  }

  func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
    guard active === peripheral, request?.operation == .discover,
          discovering.contains(ObjectIdentifier(service)) else { return }
    if let error = error { failPending("discovery_failed", error.localizedDescription, cancelConnection: true); return }
    for characteristic in service.characteristics ?? [] {
      let identifier = key(characteristic)
      if characteristics[identifier] != nil {
        failPending("ambiguous_characteristic", "Duplicate service/characteristic UUID", cancelConnection: true); return
      }
      characteristics[identifier] = characteristic
    }
    discovering.remove(ObjectIdentifier(service))
    if discovering.isEmpty { finishDiscovery(peripheral) }
  }

  private func finishDiscovery(_ peripheral: CBPeripheral) {
    let values: [[String: Any]] = characteristics.keys.sorted().compactMap { identifier in
      guard let characteristic = characteristics[identifier] else { return nil }
      let properties = characteristic.properties
      return ["service": characteristic.service?.uuid.uuidString ?? "", "characteristic": characteristic.uuid.uuidString,
        "canRead": properties.contains(.read), "canWrite": properties.contains(.write) || properties.contains(.writeWithoutResponse),
        "canWriteWithoutResponse": properties.contains(.writeWithoutResponse), "canNotify": properties.contains(.notify) || properties.contains(.indicate),
        "canIndicate": properties.contains(.indicate)]
    }
    emit("characteristics", ["id": peripheral.identifier.uuidString, "characteristics": values])
    finish(values)
  }

  func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
    guard active === peripheral, request?.operation == .subscribe, request?.key == key(characteristic) else { return }
    if let error = error { failPending("subscribe_failed", error.localizedDescription, cancelConnection: true); return }
    guard characteristic.isNotifying == request?.notifyEnabled else {
      failPending("subscribe_failed", "Notification state did not match request", cancelConnection: true); return
    }
    finish()
  }

  func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
    guard active === peripheral else { return }
    let isRead = request?.operation == .read && request?.key == key(characteristic)
    if let error = error {
      if isRead { failPending("read_failed", error.localizedDescription, cancelConnection: true) }
      else { emit("error", ["code": "notification_failed", "message": error.localizedDescription]) }
      return
    }
    guard let data = characteristic.value else {
      if isRead { failPending("read_failed", "Read produced no value", cancelConnection: true) }
      return
    }
    let bytes = FlutterStandardTypedData(bytes: data)
    if isRead { finish(bytes) }
    else if characteristic.isNotifying {
      emit("notification", ["id": peripheral.identifier.uuidString, "service": characteristic.service?.uuid.uuidString ?? "",
        "characteristic": characteristic.uuid.uuidString, "bytes": bytes])
    }
  }

  func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
    guard active === peripheral, request?.operation == .write, request?.key == key(characteristic) else { return }
    if let error = error { failPending("write_failed", error.localizedDescription, cancelConnection: true) }
    else { finish() }
  }

  func peripheral(_ peripheral: CBPeripheral, didModifyServices invalidatedServices: [CBService]) {
    guard active === peripheral else { return }
    characteristics.removeAll()
    if request != nil { failPending("services_changed", "Peripheral services changed; reconnect and discover again", cancelConnection: true) }
    emit("characteristics", ["id": peripheral.identifier.uuidString, "characteristics": []])
  }
}
