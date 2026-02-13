/**
 * Simple event emitter for cross-component communication.
 * Used to open the chat panel with a pre-filled message from anywhere in the app.
 */

type ChatOpenListener = (message: string) => void;

const listeners = new Set<ChatOpenListener>();

export const chatEvents = {
  /** Subscribe to chat open events */
  onOpenWithMessage(listener: ChatOpenListener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /** Emit a chat open event with a pre-filled message */
  openWithMessage(message: string) {
    listeners.forEach((fn) => fn(message));
  }
};
