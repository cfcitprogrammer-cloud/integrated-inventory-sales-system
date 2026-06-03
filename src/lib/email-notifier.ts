import { WEBAPP_GAS_URL } from "@/config/links";
import axios from "axios";

// --- Operational Structural Models ---
export interface DisposalItem {
  item_code: string;
  item_description: string;
  uom: string;
  request_qty: number;
  expiration_date?: string | null;
  reason?: string | null;
}

export interface SupabaseAttachment {
  name: string;
  url: string;
}

export interface DisposalRequestPayload {
  requestId: string;
  customerName: string;
  bpCode: string;
  status: string;
  dateTime: string;
  remarks: string;
  filer: {
    first_name: string;
    last_name: string;
  };
  items: DisposalItem[];
  attachments: SupabaseAttachment[];
}

// Map clean actions expected by your central script processor
type WorkflowAction =
  // Direct Disposal Pipeline
  | "DIRECT_DISPOSAL_ALERT_ACCOUNTING"
  | "DIRECT_DISPOSAL_APPROVED_ALERT_AGM"
  // Return to Warehouse Pipeline
  | "RETURN_WH_ALERT_LOGISTICS"
  | "RETURN_WH_COUNTED_ALERT_ACCOUNTING"
  | "RETURN_WH_APPROVED_ALERT_AGM";

interface WebhookPayload extends DisposalRequestPayload {
  action: WorkflowAction;
}

// Fire-and-forget background post processor
const dispatchAlert = (
  action: WorkflowAction,
  data: DisposalRequestPayload,
): void => {
  const payload: WebhookPayload = {
    action,
    ...data,
  };

  axios.post(WEBAPP_GAS_URL, JSON.stringify(payload)).catch((error) => {
    console.error(
      `Background Notification Dispatch Failed [${action}]:`,
      error,
    );
  });
};

export const emailNotifierUtil = {
  // ==========================================
  // DIRECT DISPOSAL WORKFLOW HOOKS
  // ==========================================

  /** Step 1: Fire when field user submits a Direct Disposal request */
  sendDirectDisposalToAccounting: (data: DisposalRequestPayload): void => {
    dispatchAlert("DIRECT_DISPOSAL_ALERT_ACCOUNTING", data);
  },

  /** Step 2: Fire when Accounting reviews and approves the Direct Disposal request */
  sendDirectDisposalToAGM: (data: DisposalRequestPayload): void => {
    dispatchAlert("DIRECT_DISPOSAL_APPROVED_ALERT_AGM", data);
  },

  // ==========================================
  // RETURN TO WAREHOUSE WORKFLOW HOOKS
  // ==========================================

  /** Step 1: Fire when field user logs a Return to Warehouse request */
  sendReturnToWHToLogistics: (data: DisposalRequestPayload): void => {
    dispatchAlert("RETURN_WH_ALERT_LOGISTICS", data);
  },

  /** Step 2: Fire once Logistics completes the variance count confirmation */
  sendReturnToWHToAccounting: (data: DisposalRequestPayload): void => {
    dispatchAlert("RETURN_WH_COUNTED_ALERT_ACCOUNTING", data);
  },

  /** Step 3: Fire once Accounting clears and confirms the ledger balancing */
  sendReturnToWHToAGM: (data: DisposalRequestPayload): void => {
    dispatchAlert("RETURN_WH_APPROVED_ALERT_AGM", data);
  },
};
