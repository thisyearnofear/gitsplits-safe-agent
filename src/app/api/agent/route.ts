import { NextResponse } from "next/server";
import { runAgent } from "@/lib/agent";

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();
    const response = await runAgent(prompt);
    return NextResponse.json({ result: response });
  } catch (error: unknown) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(
      { error: "An unknown error occurred" },
      { status: 500 }
    );
  }
}
