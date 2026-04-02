import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types";

export class WhatsAppService {
  constructor(private supabase: SupabaseClient<Database>) {}

  async getContacts() {
    const { data, error } = await this.supabase
      .from("whatsapp_contacts")
      .select("*")
      .order("last_message_at", { ascending: false });

    if (error) throw error;
    return data;
  }

  async getMessages(phone: string) {
    const { data, error } = await this.supabase
      .from("whatsapp_messages")
      .select("*")
      .eq("phone", phone)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return data;
  }
}
