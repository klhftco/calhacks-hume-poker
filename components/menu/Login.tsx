import { Button } from "../inputs/Button";
import { TextBox } from "../inputs/TextBox";
import { useKeypress } from "../../lib/hooks/keyPress";
import { useState } from "react";

type LoginProps = {
  authenticate: (key: string) => void;
};

export function Login({ authenticate }: LoginProps) {
  const apiKey = process.env.NEXT_PUBLIC_HUME_API_KEY; // really bad practice but need to rewrite backend for proper async fetching of process.env any non public key
  const [key, setKey] = useState(apiKey);
  useKeypress("Enter", () => authenticate(key), [key]);
  // setKey(apiKey);
  // console.log(key);

  // if (key.length === 48) {
  //   authenticate(key);
  // }

  return (
    <div className="pt-40">
      <div className="grid justify-items-center px-5">
        <div className="flex w-full flex-col items-center rounded-xl border border-neutral-200 bg-white px-14 py-12 shadow md:w-[600px]">
          <div className="pb-10 text-2xl font-bold text-neutral-700 md:text-3xl">Hume AI Sandbox</div>

          <TextBox
          className="mb-6"
          inputClassName="text-center"
          placeholder="API Key"
          text={key}
          onChange={setKey}
          autoComplete="off"
          type="password"
          />

          <Button className="mt-2 w-20 text-center" text="Log in" onClick={() => authenticate(key)} />
        </div>
      </div>
    </div>
  );
}
