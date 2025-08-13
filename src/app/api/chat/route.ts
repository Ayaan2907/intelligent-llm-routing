import { NextResponse } from "next/server";
import { Logger } from "@/utils/logger";

const logger = new Logger("API:Example");


export async function GET(request: Request) {
  try {
    logger.info("GET /api/example - Request started");

    //  logger.info("GET /api/example - Request completed successfully", {

    // });

    return NextResponse.json({status : 200});
  } catch (error) {
    logger.error("GET /api/example - Request failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}



export async function POST(request: Request) {
  try {
    logger.info("POST /api/example - Request started");

    //  logger.info("GET /api/example - Request completed successfully", {

    // });

    return NextResponse.json({status : 200});
  } catch (error) {
    logger.error("POST /api/example - Request failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}