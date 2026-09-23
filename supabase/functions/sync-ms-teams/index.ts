import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, DELETE, PATCH, OPTIONS",
};

interface CalendarSyncRequest {
  sessionId: string;
  title?: string;
  description?: string;
  startDateTime?: string;
  endDateTime?: string;
  volunteerEmail?: string;
  volunteerEmails?: string[];
  facilitatorEmail?: string;
  coordinatorEmail?: string;
  classEmail?: string;
  centreEmail?: string;
}

function buildAttendees(body: CalendarSyncRequest) {
  const rawEmails = [
    ...(body.volunteerEmails || []),
    body.volunteerEmail,
    body.facilitatorEmail,
    body.coordinatorEmail,
    body.classEmail,
    body.centreEmail,
  ];

  const uniqueEmails = [
    ...new Set(
      rawEmails
        .filter((email): email is string => !!(email && typeof email === 'string' && email.trim().length > 0))
        .map(email => email.trim().toLowerCase())
    )
  ];

  return uniqueEmails.map((email) => ({
    emailAddress: { address: email },
    type: "required"
  }));
}

async function getGraphToken(tenantId: string, clientId: string, clientSecret: string) {
  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");
  params.append("client_id", clientId);
  params.append("client_secret", clientSecret);
  params.append("scope", "https://graph.microsoft.com/.default");

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`Failed to get Graph token: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body: CalendarSyncRequest = await req.json();

    const tenantId = Deno.env.get("MS_GRAPH_TENANT_ID");
    const clientId = Deno.env.get("MS_GRAPH_CLIENT_ID");
    const clientSecret = Deno.env.get("MS_GRAPH_CLIENT_SECRET");
    const organizerEmail = Deno.env.get("MS_GRAPH_ORGANIZER_EMAIL");
    
    if (!tenantId || !clientId || !clientSecret || !organizerEmail) {
      console.error("Missing required environment variables for MS Graph");
      return new Response(
        JSON.stringify({ error: "Missing MS Graph credentials in env" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    if (req.method === "DELETE") {
      const { data: sessionData } = await supabase
        .from("sessions")
        .select("google_event_id")
        .eq("id", body.sessionId)
        .single();

      if (sessionData?.google_event_id) {
        const token = await getGraphToken(tenantId, clientId, clientSecret);
        const eventIdEnc = encodeURIComponent(sessionData.google_event_id);
        const res = await fetch(`https://graph.microsoft.com/v1.0/users/${organizerEmail}/events/${eventIdEnc}`, {
          method: "DELETE",
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (!res.ok && res.status !== 404) {
          const errorText = await res.text();
          console.error(`Graph API DELETE error: ${res.status} - ${errorText}`);
        }
        await supabase.from("sessions").update({ google_event_id: null }).eq("id", body.sessionId);
      }
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!body.title || !body.startDateTime || !body.endDateTime) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: title, startDateTime, endDateTime" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = await getGraphToken(tenantId, clientId, clientSecret);
    const attendees = buildAttendees(body);

    const toUtc = (s: string) => new Date(s).toISOString().replace("Z", "");

    const baseEvent = {
      subject: body.title,
      body: { contentType: "HTML", content: (body.description || "").replace(/\n/g, "<br>") },
      start: { dateTime: toUtc(body.startDateTime), timeZone: "UTC" },
      end: { dateTime: toUtc(body.endDateTime), timeZone: "UTC" },
      attendees,
    };

    let eventId = null;
    let meetingLink = null;
    let isUpdate = false;

    if (req.method === "PATCH" && body.sessionId) {
      const { data: sessionData } = await supabase
        .from("sessions")
        .select("google_event_id, meeting_link")
        .eq("id", body.sessionId)
        .single();
        
      if (sessionData?.google_event_id) {
        isUpdate = true;
        const eventIdEnc = encodeURIComponent(sessionData.google_event_id);
        const res = await fetch(`https://graph.microsoft.com/v1.0/users/${organizerEmail}/events/${eventIdEnc}`, {
          method: "PATCH",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(baseEvent)
        });
        
        if (!res.ok) throw new Error(`Graph PATCH ${res.status}: ${await res.text()}`);
        const data = await res.json();
        eventId = data.id;
        meetingLink = data.onlineMeeting?.joinUrl || sessionData.meeting_link;
      }
    }

    if (!isUpdate) {
      const createEvent = {
        ...baseEvent,
        isOnlineMeeting: true,
        onlineMeetingProvider: "teamsForBusiness"
      };

      const res = await fetch(`https://graph.microsoft.com/v1.0/users/${organizerEmail}/events`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(createEvent)
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("MS Graph API POST error:", errorText);
        throw new Error(`Graph API POST error: ${res.status} - ${errorText}`);
      }

      const data = await res.json();
      eventId = data.id;
      meetingLink = data.onlineMeeting?.joinUrl;
    }

    if (body.sessionId && !isUpdate) {
      const { error: updateError } = await supabase
        .from("sessions")
        .update({ google_event_id: eventId, meeting_link: meetingLink })
        .eq("id", body.sessionId);

      if (updateError) console.error("Error updating session:", updateError);
    }

    return new Response(
      JSON.stringify({ success: true, eventId, meetingLink }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("MS Teams sync error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
