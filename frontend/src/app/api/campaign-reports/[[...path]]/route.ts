import { campaignGateway } from "@/features/campaigns/server";
export const GET = (request: Request) => campaignGateway(request, "campaign-reports");
export const POST = (request: Request) => campaignGateway(request, "campaign-reports");
