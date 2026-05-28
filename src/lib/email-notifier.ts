import { WEBAPP_GAS_URL } from "@/config/links";
import axios from "axios";

// 1. Define strict interfaces for your data structure
export interface DisposalItem {
  sku: string;
  description: string;
  uom: string;
  qty: number;
}

export interface SupabaseAttachment {
  name: string;
  url: string;
}

export interface DisposalRequestPayload {
  requestId: string;
  submittedBy: string;
  department: string;
  dateTime: string;
  warehouseLocation: string;
  items: DisposalItem[];
  attachments: SupabaseAttachment[];
  remarks: string;
  customerName: string;
}

// 2. Define the payload shape that Apps Script expects
interface WebhookPayload extends DisposalRequestPayload {
  action: "NEW_DISPOSAL_REQUEST" | "NEW_RETURN_WH_REQUEST";
}

export const emailNotifierUtil = {
  /**
   * Fires a Bad Order Request disposal notification asynchronously.
   * Execution completes instantly without waiting for Google Apps Script to reply.
   */
  sendDirectDisposalAlert: (data: DisposalRequestPayload): void => {
    const payload: WebhookPayload = {
      action: "NEW_DISPOSAL_REQUEST",
      ...data,
    };

    // 🚀 FIRE-AND-FORGET: Trigger axios post immediately.
    // We don't return this promise, nor do we await it.
    axios.post(WEBAPP_GAS_URL, JSON.stringify(payload)).catch((error) => {
      // Caught silently in the background
      console.error("Background Notification Dispatch Failed:", error);
    });
  },

  sendReturnToWHAlert: (data: DisposalRequestPayload): void => {
    const payload: WebhookPayload = {
      action: "NEW_RETURN_WH_REQUEST",
      ...data,
    };

    // 🚀 FIRE-AND-FORGET: Trigger axios post immediately.
    // We don't return this promise, nor do we await it.
    axios.post(WEBAPP_GAS_URL, JSON.stringify(payload)).catch((error) => {
      // Caught silently in the background
      console.error("Background Notification Dispatch Failed:", error);
    });
  },
};
