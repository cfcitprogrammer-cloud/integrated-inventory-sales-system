import { useState, useEffect } from "react";
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Circle,
  Mail,
  Loader2,
} from "lucide-react";
import { supabase } from "@/config/db";

type StatusType = "APPROVE" | "REJECTED" | "HOLD" | string;

interface TimelineData {
  workflow_type: "For Disposal" | "Return to Warehouse" | string;
  created_at: string;
  dd_acc_updated_at?: string | null;
  dd_acc_status?: StatusType | null;
  dd_agm_updated_at?: string | null;
  dd_agm_status?: StatusType | null;
  rwh_logistic_updated_at?: string | null;
  rwh_acc_updated_at?: string | null;
  rwh_agm_updated_at?: string | null;
  rwh_agm_status?: StatusType | null;
}

interface RequestTimelineProps {
  badOrderId: string | number | undefined; // 👈 Simply accept the ID as a prop
}

interface Milestone {
  title: string;
  description: string;
  timestamp: string | null | undefined;
  statusState: "completed" | "failed" | "warning" | "pending" | "upcoming";
  statusText?: string;
  isEmailAction?: boolean;
}

export default function RequestTimeline({ badOrderId }: RequestTimelineProps) {
  const [data, setData] = useState<TimelineData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Handle data fetching directly inside the timeline lifecycle
  useEffect(() => {
    async function fetchWorkflow() {
      if (!badOrderId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const { data: workflowRow, error: fetchError } = await supabase()
          .from("tbl_bo_workflow")
          .select(
            `
            workflow_type,
            created_at,
            dd_acc_updated_at,
            dd_acc_status,
            dd_agm_updated_at,
            dd_agm_status,
            rwh_logistic_updated_at,
            rwh_acc_updated_at,
            rwh_agm_updated_at,
            rwh_agm_status
          `,
          )
          .eq("bo_input_id", badOrderId) // Matches row primary key or mapping column ID
          .single();

        if (fetchError) throw fetchError;
        setData(workflowRow);
      } catch (err: any) {
        console.error("Timeline Fetch Error:", err.message);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    }

    fetchWorkflow();
  }, [badOrderId]);

  // --- Loading State UI ---
  if (isLoading) {
    return (
      <div className="rounded-xl border bg-white p-6 shadow-sm max-w-md w-full flex flex-col items-center justify-center h-48 text-xs text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
        <span>Locating workflow sequence logs...</span>
      </div>
    );
  }

  // --- Error State UI ---
  if (error || !data) {
    return (
      <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50/50 p-5 text-center text-xs text-rose-600 max-w-md w-full">
        Could not load tracking information for Bad Order #{badOrderId}
      </div>
    );
  }

  const isDisposal = data.workflow_type === "For Disposal";

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return null;
    return new Date(dateString).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const milestones: Milestone[] = [];

  // Milestone 1: Submission
  milestones.push({
    title: "Request Filed",
    description: isDisposal
      ? "Document registered. Notification email routed to Accounting for processing."
      : "Document registered. Notification email routed to Logistics.",
    timestamp: formatDate(data.created_at),
    statusState: "completed",
    isEmailAction: true,
  });

  if (isDisposal) {
    // ---- FOR DISPOSAL TRACK ----
    let accState: Milestone["statusState"] = "pending";
    if (data.dd_acc_status === "APPROVE") accState = "completed";
    else if (data.dd_acc_status === "REJECTED") accState = "failed";
    else if (data.dd_acc_status === "HOLD") accState = "warning";

    milestones.push({
      title: "Accounting Processing",
      description:
        accState === "completed"
          ? "Cleared by Accounting. Details emailed to AGM for approval."
          : "Pending ledger validation and structural disposal clearance.",
      timestamp: formatDate(data.dd_acc_updated_at),
      statusState: accState,
      statusText: data.dd_acc_status || undefined,
      isEmailAction: true,
    });

    let agmState: Milestone["statusState"] = "upcoming";
    if (accState === "completed") {
      if (data.dd_agm_status === "APPROVE") agmState = "completed";
      else if (data.dd_agm_status === "REJECTED") agmState = "failed";
      else agmState = "pending";
    }

    milestones.push({
      title: "AGM Final Approval",
      description:
        "Final authorization execution signature for disposal manifest destruction.",
      timestamp: formatDate(data.dd_agm_updated_at),
      statusState: agmState,
      statusText: data.dd_agm_status || undefined,
      isEmailAction: true,
    });
  } else {
    // ---- RETURN TO WAREHOUSE TRACK ----
    let logState: Milestone["statusState"] = "pending";
    if (data.rwh_logistic_updated_at) logState = "completed";

    milestones.push({
      title: "Logistics Actual Count Input",
      description:
        logState === "completed"
          ? "Actual count registered. Passed down to Accounting for document pricing metrics."
          : "Awaiting physical distribution counter inputs at landing loading docks.",
      timestamp: formatDate(data.rwh_logistic_updated_at),
      statusState: logState,
      isEmailAction: true,
    });

    let accState: Milestone["statusState"] = "upcoming";
    if (logState === "completed") {
      accState = data.rwh_acc_updated_at ? "completed" : "pending";
    }

    milestones.push({
      title: "Accounting Pricing Approval",
      description:
        accState === "completed"
          ? "Pricing approved. Forwarded to AGM desk for final executive validation."
          : "Calculating cost variances and generating item valuation reports.",
      timestamp: formatDate(data.rwh_acc_updated_at),
      statusState: accState,
      isEmailAction: true,
    });

    let agmState: Milestone["statusState"] = "upcoming";
    if (accState === "completed") {
      if (data.rwh_agm_status === "APPROVE") agmState = "completed";
      else if (data.rwh_agm_status === "REJECTED") agmState = "failed";
      else agmState = "pending";
    }

    milestones.push({
      title: "AGM Final Approval",
      description:
        "Final operational signature to reconcile and close current return pipeline.",
      timestamp: formatDate(data.rwh_agm_updated_at),
      statusState: agmState,
      statusText: data.rwh_agm_status || undefined,
      isEmailAction: true,
    });
  }

  const getStatusIcon = (state: Milestone["statusState"]) => {
    switch (state) {
      case "completed":
        return <CheckCircle2 className="h-5 w-5 text-emerald-600 bg-white" />;
      case "failed":
        return <XCircle className="h-5 w-5 text-rose-600 bg-white" />;
      case "warning":
        return <AlertCircle className="h-5 w-5 text-amber-500 bg-white" />;
      case "pending":
        return (
          <Clock className="h-5 w-5 text-blue-500 animate-pulse bg-white" />
        );
      case "upcoming":
      default:
        return (
          <Circle className="h-5 w-5 text-gray-300 bg-white fill-gray-50" />
        );
    }
  };

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm max-w-md w-full">
      <div className="mb-5 pb-4 border-b">
        <h3 className="text-sm font-semibold text-foreground">
          Transaction Progress Tracker
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Route Strategy:{" "}
          <span className="font-semibold text-primary">
            {data.workflow_type}
          </span>
        </p>
      </div>

      <div className="relative pl-2 space-y-6">
        <div className="absolute left-[17px] top-2 bottom-2 w-[1.5px] bg-gray-200 -z-10" />

        {milestones.map((step, index) => (
          <div key={index} className="relative flex gap-4 text-xs">
            <div className="flex items-start pt-0.5 z-10 shrink-0">
              {getStatusIcon(step.statusState)}
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h4
                    className={`font-semibold text-sm ${step.statusState === "upcoming" ? "text-gray-400" : "text-foreground"}`}
                  >
                    {step.title}
                  </h4>
                  {step.isEmailAction && step.statusState === "completed" && (
                    <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.2 rounded text-[10px]">
                      <Mail className="h-3 w-3" /> Email Sent
                    </span>
                  )}
                </div>
                {step.timestamp && (
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap bg-muted px-1.5 py-0.5 rounded">
                    {step.timestamp}
                  </span>
                )}
              </div>
              <p
                className={`text-xs leading-relaxed ${step.statusState === "upcoming" ? "text-gray-300" : "text-muted-foreground"}`}
              >
                {step.description}
              </p>
              {step.statusText && (
                <div className="pt-1">
                  <span
                    className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold border tracking-wider ${
                      step.statusText === "APPROVE"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : step.statusText === "REJECTED"
                          ? "bg-rose-50 text-rose-700 border-rose-200"
                          : "bg-amber-50 text-amber-700 border-amber-200"
                    }`}
                  >
                    {step.statusText}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
