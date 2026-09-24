import { env } from "../../config/env";
import { WhatsAppProvider } from "./provider";
import { MockWhatsAppProvider } from "./mockProvider";
import { CloudApiWhatsAppProvider } from "./cloudApiProvider";
import { AiSensyProvider } from "./aisensyProvider";
import { WhapiProvider } from "./whapiProvider";

let cachedProvider: WhatsAppProvider | null = null;

export function getWhatsAppProvider(): WhatsAppProvider {
  if (cachedProvider) return cachedProvider;

  switch (env.WHATSAPP_PROVIDER) {
    case "cloud_api":
      cachedProvider = new CloudApiWhatsAppProvider({
        // env.ts already validates these are present when provider=cloud_api
        phoneNumberId: env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID!,
        accessToken: env.WHATSAPP_CLOUD_API_TOKEN!,
        apiVersion: env.WHATSAPP_CLOUD_API_VERSION,
      });
      break;
    case "aisensy":
      cachedProvider = new AiSensyProvider({
        // env.ts already validates these are present when provider=aisensy
        projectId: env.AISENSY_PROJECT_ID!,
        apiPassword: env.AISENSY_API_PASSWORD!,
      });
      break;
    case "whapi":
      cachedProvider = new WhapiProvider({
        // env.ts already validates this is present when provider=whapi
        token: env.WHAPI_TOKEN!,
      });
      break;
    case "bsp_adapter":
      // Placeholder for a generic future BSP adapter beyond AiSensy/Whapi -
      // the whole point of the provider interface is that adding one is a
      // new class here, not a rewrite of the worker/campaign code that
      // calls it.
      throw new Error("bsp_adapter provider is not implemented yet");
    case "mock":
    default:
      cachedProvider = new MockWhatsAppProvider();
  }

  return cachedProvider;
}
