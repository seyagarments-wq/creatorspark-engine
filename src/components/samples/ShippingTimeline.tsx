import { CheckCircle, Circle, Clock, Package, Truck } from "lucide-react";

interface ShippingTimelineProps {
  status: string;
  createdAt: string;
  shippedAt?: string | null;
  deliveredAt?: string | null;
}

interface TimelineStep {
  status: string;
  label: string;
  date?: string | null;
  icon: React.ReactNode;
}

export function ShippingTimeline({ status, createdAt, shippedAt, deliveredAt }: ShippingTimelineProps) {
  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const steps: TimelineStep[] = [
    {
      status: "requested",
      label: "Requested",
      date: createdAt,
      icon: <Package className="w-4 h-4" />,
    },
    {
      status: "approved",
      label: "Approved",
      date: status !== "requested" && status !== "cancelled" ? createdAt : null,
      icon: <CheckCircle className="w-4 h-4" />,
    },
    {
      status: "shipped",
      label: "Shipped",
      date: shippedAt,
      icon: <Truck className="w-4 h-4" />,
    },
    {
      status: "delivered",
      label: "Delivered",
      date: deliveredAt,
      icon: <CheckCircle className="w-4 h-4" />,
    },
  ];

  const getStepStatus = (stepStatus: string): "complete" | "current" | "upcoming" => {
    const statusOrder = ["requested", "approved", "shipped", "delivered"];
    const currentIndex = statusOrder.indexOf(status);
    const stepIndex = statusOrder.indexOf(stepStatus);

    if (status === "cancelled") return "upcoming";
    if (stepIndex < currentIndex) return "complete";
    if (stepIndex === currentIndex) return "current";
    return "upcoming";
  };

  return (
    <div className="relative">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const stepStatus = getStepStatus(step.status);
          
          return (
            <div key={step.status} className="flex-1 relative">
              {/* Connector line */}
              {index < steps.length - 1 && (
                <div
                  className={`absolute top-4 left-1/2 w-full h-0.5 ${
                    stepStatus === "complete" ? "bg-success" : "bg-muted"
                  }`}
                />
              )}
              
              {/* Step circle */}
              <div className="relative z-10 flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                    stepStatus === "complete"
                      ? "bg-success text-success-foreground"
                      : stepStatus === "current"
                      ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {stepStatus === "complete" ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : stepStatus === "current" ? (
                    step.icon
                  ) : (
                    <Circle className="w-4 h-4" />
                  )}
                </div>
                
                {/* Label */}
                <span
                  className={`mt-2 text-xs font-medium ${
                    stepStatus === "upcoming"
                      ? "text-muted-foreground"
                      : "text-foreground"
                  }`}
                >
                  {step.label}
                </span>
                
                {/* Date */}
                {step.date && (
                  <span className="text-xs text-muted-foreground mt-0.5">
                    {formatDate(step.date)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}