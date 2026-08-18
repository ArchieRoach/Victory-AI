import { useState } from "react";

function cloudinaryBlurSrc(src) {
  if (!src || !src.includes("res.cloudinary.com/") || !src.includes("/upload/")) return null;
  return src.replace("/upload/", "/upload/e_blur:1000,q_1,w_50/");
}

// Drop-in <img> replacement: pass the same sizing/shape classes (w-X h-X,
// rounded-*, border, aspect-*) you'd put on a plain <img>. Fades in on load;
// shows a blurred low-res placeholder for Cloudinary-hosted images, or a
// skeleton shimmer otherwise — so loading never pops in as a blank flash or
// layout jump.
export function ProgressiveImage({ src, alt, className = "", ...rest }) {
  const [loaded, setLoaded] = useState(false);
  const blurSrc = cloudinaryBlurSrc(src);

  return (
    <span className={`relative block overflow-hidden ${className}`}>
      {!loaded && (
        blurSrc
          ? <img src={blurSrc} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover scale-110 blur-sm" />
          : <div className="absolute inset-0 skeleton-shimmer" />
      )}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
        {...rest}
      />
    </span>
  );
}
