import { create } from "zustand";
import { useProfileStore } from "@/hooks/useProfileStore";
import { supabase } from "@/integrations/supabase/client";
import type { ChatMessage } from "@/lib/chat.functions";

const HISTORY_LIMIT = 50;

interface ChatStore {
  panelOpen: boolean;
  messages: ChatMessage[];
  unread: number;
  sending: boolean;
  loading: boolean;
  error: string | null;
  subscribed: boolean;
  setPanelOpen: (open: boolean) => void;
  /** Loads recent history and subscribes to new messages. Safe to call
   * repeatedly — it's a no-op once already subscribed. */
  init: () => Promise<void>;
  send: (message: string) => Promise<boolean>;
  /** Tears down the realtime subscription and clears local state (called on
   * wallet disconnect). */
  reset: () => void;
}

let channel: ReturnType<typeof supabase.channel> | null = null;

export const useChatStore = create<ChatStore>((set, get) => ({
  panelOpen: false,
  messages: [],
  unread: 0,
  sending: false,
  loading: false,
  error: null,
  subscribed: false,
  setPanelOpen: (panelOpen) => set({ panelOpen, unread: panelOpen ? 0 : get().unread }),
  reset: () => {
    if (channel) {
      void supabase.removeChannel(channel);
      channel = null;
    }
    set({
      messages: [],
      unread: 0,
      sending: false,
      loading: false,
      error: null,
      subscribed: false,
    });
  },
  init: async () => {
    if (get().subscribed) return;
    set({ subscribed: true, loading: true });

    const history = await supabase
      .from("chat_messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);
    if (!history.error && history.data) {
      set({ messages: [...history.data].reverse() });
    }
    set({ loading: false });

    channel = supabase
      .channel("chat_messages_feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          const row = payload.new as ChatMessage;
          set((s) => {
            if (s.messages.some((m) => m.id === row.id)) return s;
            return {
              messages: [...s.messages, row].slice(-HISTORY_LIMIT),
              unread: s.panelOpen ? 0 : s.unread + 1,
            };
          });
        },
      )
      .subscribe();
  },
  send: async (message) => {
    const proof = useProfileStore.getState().proof;
    if (!proof) return false;
    const trimmed = message.trim();
    if (!trimmed) return false;
    set({ sending: true, error: null });
    try {
      const { sendChatMessage } = await import("@/lib/chat.functions");
      // The new row arrives back through the realtime subscription above,
      // so it isn't appended here — avoids showing it twice.
      await sendChatMessage({ data: { proof, message: trimmed } });
      set({ sending: false });
      return true;
    } catch (e) {
      set({
        sending: false,
        error: e instanceof Error ? e.message : "Could not send that message.",
      });
      return false;
    }
  },
}));
