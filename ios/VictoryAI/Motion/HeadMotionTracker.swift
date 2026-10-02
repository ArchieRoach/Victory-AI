import CoreMotion

/// Counts head movements (slips, rolls, pulls) from AirPods' motion sensors and reports
/// each one to the web app's Live Coach, which then stops estimating head movement from
/// the camera. Nothing is recorded or sent anywhere.
@MainActor
final class HeadMotionTracker {
    static let shared = HeadMotionTracker()

    var onMove: (() -> Void)?

    private let manager = CMHeadphoneMotionManager()
    private var reference: CMAttitude?
    private var out = false

    private static let outRadians = 0.26   // about 15° away from where the head started
    private static let backRadians = 0.10

    func start() -> Bool {
        guard manager.isDeviceMotionAvailable else { return false }
        reference = nil
        out = false
        manager.startDeviceMotionUpdates(to: .main) { [weak self] motion, _ in
            guard let motion else { return }
            MainActor.assumeIsolated { self?.handle(motion) }
        }
        return true
    }

    func stop() {
        manager.stopDeviceMotionUpdates()
        reference = nil
        onMove = nil
    }

    private func handle(_ motion: CMDeviceMotion) {
        guard let reference else {
            self.reference = motion.attitude.copy() as? CMAttitude
            return
        }
        guard let attitude = motion.attitude.copy() as? CMAttitude else { return }
        attitude.multiply(byInverseOf: reference)
        let offset = max(abs(attitude.roll), abs(attitude.yaw), abs(attitude.pitch))
        if !out && offset >= Self.outRadians {
            out = true
            onMove?()
        } else if out && offset <= Self.backRadians {
            out = false
        }
    }
}
