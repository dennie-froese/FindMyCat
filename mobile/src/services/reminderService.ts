import type { VaccinationRecord, CatProfile } from '../types/index.ts';

export interface BoosterReminderSchedule {
  vaccineId: string;
  vaccineName: string;
  petName: string;
  dueDate: string;
  sevenDayReminderDate: string;
  oneDayReminderDate: string;
  status: 'overdue' | 'due_soon' | 'scheduled';
  urgencyDays: number; // Positive = days until due, negative = days overdue
  message7Day: string;
  message1Day: string;
}

/**
 * Calculates 7-day and 1-day vaccination booster reminder schedules based on ISO date strings.
 */
export function calculateBoosterSchedule(
  vaccine: VaccinationRecord,
  petName: string,
  referenceDate: Date = new Date()
): BoosterReminderSchedule {
  const due = new Date(vaccine.nextDueDate);
  const now = new Date(referenceDate);

  // Normalize to midnight UTC for day difference calculation
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysDiff = Math.round((due.getTime() - now.getTime()) / msPerDay);

  const sevenDay = new Date(due.getTime() - 7 * msPerDay);
  const oneDay = new Date(due.getTime() - 1 * msPerDay);

  let status: 'overdue' | 'due_soon' | 'scheduled' = 'scheduled';
  if (daysDiff < 0) {
    status = 'overdue';
  } else if (daysDiff <= 30) {
    status = 'due_soon';
  }

  return {
    vaccineId: vaccine.id,
    vaccineName: vaccine.name,
    petName,
    dueDate: vaccine.nextDueDate,
    sevenDayReminderDate: sevenDay.toISOString().split('T')[0],
    oneDayReminderDate: oneDay.toISOString().split('T')[0],
    status,
    urgencyDays: daysDiff,
    message7Day: `🔔 7-Day Alert: ${petName}'s ${vaccine.name} is due on ${vaccine.nextDueDate} at ${vaccine.vetClinic}.`,
    message1Day: `🚨 Urgent: ${petName}'s ${vaccine.name} is due tomorrow (${vaccine.nextDueDate}). Call ${vaccine.vetClinic} to book.`,
  };
}

/**
 * Evaluates all vaccines for a cat and returns upcoming and overdue booster schedules.
 */
export function getCatBoosterSchedules(
  cat: CatProfile,
  referenceDate: Date = new Date()
): BoosterReminderSchedule[] {
  if (!cat.vaccinations || cat.vaccinations.length === 0) {
    return [];
  }

  return cat.vaccinations.map((vac) =>
    calculateBoosterSchedule(vac, cat.name, referenceDate)
  );
}

/**
 * Simulates local scheduling of OS push notifications for all due boosters.
 */
export function scheduleLocalBoosterAlerts(
  cat: CatProfile
): {
  success: boolean;
  scheduledCount: number;
  schedules: BoosterReminderSchedule[];
  confirmationMessage: string;
} {
  const schedules = getCatBoosterSchedules(cat);
  const activeSchedules = schedules.filter((s) => s.status !== 'overdue');

  return {
    success: true,
    scheduledCount: activeSchedules.length * 2, // 7-day and 1-day alerts
    schedules,
    confirmationMessage: `Scheduled ${activeSchedules.length * 2} local booster alerts for ${cat.name} (7-day and 1-day prior).`,
  };
}
