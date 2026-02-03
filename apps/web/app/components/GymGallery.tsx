"use client";

import { useState } from "react";

type Props = {
  images: string[];
  name: string;
};

export default function GymGallery({ images, name }: Props) {
  const [activeImage, setActiveImage] = useState(images[0]);

  return (
    <div>
     {/* Main image */}
<div className="w-full mb-4 max-h-[420px] overflow-hidden rounded-lg">
  {activeImage ? (
    <img
        src={activeImage}
        alt={name}
        className="w-full h-full object-contain object-center"
    />
  ) : (
    <div className="h-48 bg-gray-100 flex items-center justify-center text-gray-400">
      No image
    </div>
  )}
</div>

      {/* Thumbnails */}
      <div className="grid grid-cols-4 max-w-3xl gap-4">
        {images.map((img, i) => (
          <img
            key={i}
            src={img}
            onClick={() => setActiveImage(img)}
            className={`rounded-lg md:h-24 h-14 object-cover cursor-pointer transition
              ${activeImage === img ? "ring-2 ring-blue-500" : "hover:opacity-80"}
            `}
            alt={`Thumbnail ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
