import SignupProgress from "./SignupProgress";


export default function SignupLayout({
  step,
  children,
}: {
  step: number;
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-2xl mx-auto py-12 px-4 mb-2">
      <h1 className="text-4xl md:text-7xl font-bold max-w-[850px] text-center mx-auto mt-8">Together into a new era of wellbeing</h1>
            <p className="mt-3 text-m mb-4 text-gray-500/90">List your gym or Fitness Studio and reach new customer groups and receive additional income. Create an account to get started. Takes about 3 minutes!</p>
      {/* <SignupProgress step={step} /> */}
      <div className="mt-8">{children}</div>
    </div>
  );
}
