import { useState } from "react";
import CreatorLayout from "@/components/layout/CreatorLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/hooks/use-settings";
import { weekdayIndex, weekdayLabel } from "@/lib/upload-day";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const WEEKDAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CreatorCalendar() {
  const { settings } = useSettings();
  const uploadDay = settings.upload_schedule.weekday;
  const uploadDayIndex = weekdayIndex(uploadDay);

  const today = new Date();
  const [monthDate, setMonthDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayWeekday = new Date(year, month, 1).getDay();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  const shiftMonth = (delta: number) => setMonthDate(new Date(year, month + delta, 1));

  return (
    <CreatorLayout>
      <div className="max-w-4xl mx-auto space-y-4 md:space-y-6 animate-fade-in">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Upload Calendar</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload day is {weekdayLabel(uploadDay)}. Batch your videos and upload them that day.
          </p>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 md:p-6 pb-2 md:pb-4">
            <CardTitle className="text-base md:text-lg">
              {monthDate.toLocaleString("default", { month: "long", year: "numeric" })}
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => shiftMonth(-1)}
                aria-label="Previous month"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => shiftMonth(1)}
                aria-label="Next month"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-3 md:p-6 pt-0 md:pt-0">
            <div className="grid grid-cols-7 gap-1.5 md:gap-2 text-center text-xs text-muted-foreground mb-2">
              {WEEKDAY_HEADERS.map((label, i) => (
                <div key={label} className={cn(i === uploadDayIndex && "text-primary font-medium")}>
                  {label}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5 md:gap-2">
              {Array.from({ length: firstDayWeekday }).map((_, i) => (
                <div key={`pad-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const dayNum = i + 1;
                const isUploadDay = (firstDayWeekday + i) % 7 === uploadDayIndex;
                const isToday = isCurrentMonth && today.getDate() === dayNum;
                return (
                  <div
                    key={dayNum}
                    className={cn(
                      "aspect-square rounded-md border flex items-center justify-center text-xs md:text-sm",
                      isUploadDay && "bg-primary/10 text-primary font-medium ring-1 ring-primary/30 border-transparent",
                      isToday && "border-2 border-primary"
                    )}
                  >
                    {dayNum}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </CreatorLayout>
  );
}
