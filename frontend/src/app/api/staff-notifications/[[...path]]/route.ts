import { campaignGateway } from "@/features/campaigns/server";
export const GET = (request: Request) => campaignGateway(request, "staff-notifications");
export const PATCH = (request: Request) => campaignGateway(request, "staff-notifications");
export const DELETE = (request: Request) => campaignGateway(request, "staff-notifications");
