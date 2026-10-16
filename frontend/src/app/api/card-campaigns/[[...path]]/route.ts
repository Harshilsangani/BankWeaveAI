import { campaignGateway } from "@/features/campaigns/server";
export const GET = (request: Request) => campaignGateway(request, "card-campaigns");
export const POST = (request: Request) => campaignGateway(request, "card-campaigns");
