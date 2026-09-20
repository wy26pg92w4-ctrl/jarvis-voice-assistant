export interface Fact {
  id: string;
  key: string;
  value: string;
  createdAt: string;
  updatedAt: string;
}

export type ReminderTriggerType = "time" | "event";

export interface Reminder {
  id: string;
  message: string;
  triggerType: ReminderTriggerType;
  dueAt?: string;
  eventName?: string;
  createdAt: string;
  firedAt: string | null;
}
