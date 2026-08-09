const steps = [
  "Account",
  "Business details",
  "Offer",
  "Review",
];

export default function SignupProgress({ step }: { step: number }) {
  return (
    <ol className="flex justify-between text-sm text-gray-500">
      {steps.map((label, index) => (
        <li
          key={label}
          className={index + 1 <= step ? "text-black font-medium" : ""}
        >
          {label}
        </li>
      ))}
    </ol>
  );
}
