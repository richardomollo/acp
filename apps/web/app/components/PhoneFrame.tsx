export default function PhoneFrame({
  src,
  alt,
  className = "",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <div
      className={`relative rounded-[2.5rem] border-[8px] border-black bg-black shadow-2xl overflow-hidden ${className}`}
      style={{ aspectRatio: "390 / 844" }}
    >
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-5 bg-black rounded-b-2xl z-10" />
      <img src={src} alt={alt} className="w-full h-full object-cover object-top" />
    </div>
  );
}
