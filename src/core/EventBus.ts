export type EventCallback<T = any> = (payload: T) => void;

export class EventBus {
  private static instance: EventBus;
  private listeners: Map<string, Set<EventCallback>> = new Map();

  private constructor() {}

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  public on<T = any>(event: string, callback: EventCallback<T>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  public off<T = any>(event: string, callback: EventCallback<T>): void {
    if (this.listeners.has(event)) {
      this.listeners.get(event)!.delete(callback);
    }
  }

  public emit<T = any>(event: string, payload?: T): void {
    if (this.listeners.has(event)) {
      this.listeners.get(event)!.forEach((cb) => {
        try {
          cb(payload);
        } catch (err) {
          console.error(`Error in event listener for [${event}]:`, err);
        }
      });
    }
  }
}

export const EVENTS = {
  FILE_OPENED: 'file:opened',
  FILE_SAVED: 'file:saved',
  FILE_CHANGED: 'file:changed',
  TERMINAL_OUTPUT: 'term:output',
  TERMINAL_COMMAND: 'term:command',
  LAB_SELECTED: 'lab:selected',
  EVALUATE_REQUESTED: 'eval:requested',
  EVALUATE_COMPLETED: 'eval:completed',
};
