import SwiftUI

/// Apple's Liquid Glass for the native screens (sign-in, paywall, errors).
/// On iOS 26 and later it uses the real `glassEffect`; on older iPhones it falls back to a frosted
/// material so the screen still reads the same. The web app inside the shell uses the matching
/// `GlassView` in frontend/src/lib/glass/expo-glass-effect.js.
///
/// Corners follow Apple's concentricity rule: pass the container's corner radius and padding to
/// `concentric(_:padding:)` to get the radius an inner shape should use.
struct GlassView<Content: View>: View {
    var cornerRadius: CGFloat = 16
    var tint: Color? = nil
    var isInteractive = false
    @ViewBuilder var content: () -> Content

    var body: some View {
        content().glassSurface(cornerRadius: cornerRadius, tint: tint, interactive: isInteractive)
    }
}

extension View {
    /// Liquid Glass behind this view, in a rounded rectangle.
    @ViewBuilder
    func glassSurface(cornerRadius: CGFloat, tint: Color? = nil, interactive: Bool = false) -> some View {
        if #available(iOS 26.0, *) {
            self.glassEffect(victoryGlass(tint: tint, interactive: interactive), in: .rect(cornerRadius: cornerRadius))
        } else {
            self.background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        }
    }
}

@available(iOS 26.0, *)
private func victoryGlass(tint: Color?, interactive: Bool) -> Glass {
    var glass = Glass.regular
    if let tint { glass = glass.tint(tint) }
    if interactive { glass = glass.interactive() }
    return glass
}

/// Concentric corners: an inner shape's radius is the outer radius minus the gap between them.
func concentric(_ outerRadius: CGFloat, padding: CGFloat, minimum: CGFloat = 6) -> CGFloat {
    max(minimum, outerRadius - padding)
}
