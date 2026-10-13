import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";

/* -------------------- CONFIG -------------------- */

const ORGANIZER_EMAIL = "gtsession@wazireducationsociety.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, DELETE, PATCH, OPTIONS",
};

/* -------------------- TYPES -------------------- */

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

  googleEventId?: string;
  meetingLink?: string;
}

/* -------------------- HELPERS -------------------- */

// ✅ Safe and deduplicated attendee builder
function buildAttendees(body: CalendarSyncRequest) {
  const rawEmails = [
    ...(body.volunteerEmails || []),
    body.volunteerEmail,
    body.facilitatorEmail,
    body.coordinatorEmail,
    body.classEmail,
    body.centreEmail,
  ];

  // 1. Filter out invalid/empty values
  // 2. Trim and lowercase for normalization
  // 3. Use Set to deduplicate
  const uniqueEmails = [
    ...new Set(
      rawEmails
        .filter((email): email is string => !!(email && typeof email === 'string' && email.trim().length > 0))
        .map(email => email.trim().toLowerCase())
    )
  ];

  return uniqueEmails.map((email) => ({
    email: email,
    responseStatus: "needsAction",
  }));
}

// PEM → DER
function pemToDer(pem: string): ArrayBuffer {
  const clean = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/^"|"$/g, '') // remove surrounding quotes if any
    .replace(/\\n/g, "") // remove literal \n strings
    .replace(/\n/g, ""); // remove actual newlines

  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}

// JWT
async function createJWT(serviceAccountEmail: string, privateKey: string, scope: string) {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    iss: serviceAccountEmail,
    sub: ORGANIZER_EMAIL,
    scope: scope,
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const encode = (obj: any) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");

  const data = `${encode(header)}.${encode(payload)}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(data)
  );

  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  return `${data}.${sig}`;
}

async function getAccessToken(serviceAccountEmail: string, privateKey: string, scope = "https://www.googleapis.com/auth/calendar") {
  const jwt = await createJWT(serviceAccountEmail, privateKey, scope);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const data = await res.json();

  if (!data.access_token) {
    throw new Error(JSON.stringify(data));
  }

  return data.access_token;
}

async function createCalendarEvent(event: any, serviceAccountEmail: string, privateKey: string) {
  const token = await getAccessToken(serviceAccountEmail, privateKey);

  // Validate attendees before sending
  if (event.attendees && Array.isArray(event.attendees)) {
    event.attendees = event.attendees.filter((attendee: any) => {
      const isValid = attendee.email && typeof attendee.email === 'string' && attendee.email.includes('@');
      if (!isValid) {
        console.warn(`Skipping invalid attendee email: ${attendee.email}`);
      }
      return isValid;
    });
  }

  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendNotifications=true",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    }
  );

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`Calendar API error (${res.status}):`, errorText);
    throw new Error(`Calendar API error: ${res.status} - ${errorText}`);
  }

  const data = await res.json();
  return { eventId: data.id, hangoutLink: data.hangoutLink };
}

async function updateCalendarEvent(eventId: string, event: any, serviceAccountEmail: string, privateKey: string) {
  const token = await getAccessToken(serviceAccountEmail, privateKey);

  // Validate attendees before sending
  if (event.attendees && Array.isArray(event.attendees)) {
    event.attendees = event.attendees.filter((attendee: any) => {
      const isValid = attendee.email && typeof attendee.email === 'string' && attendee.email.includes('@');
      if (!isValid) {
        console.warn(`Skipping invalid attendee email: ${attendee.email}`);
      }
      return isValid;
    });
  }

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}?sendNotifications=true`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    }
  );

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`Calendar API error (${res.status}):`, errorText);
    throw new Error(`Calendar API error: ${res.status} - ${errorText}`);
  }

  const data = await res.json();
  return { eventId: data.id, hangoutLink: data.hangoutLink };
}

/* -------------------- SERVER -------------------- */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body: CalendarSyncRequest = await req.json();

    const serviceAccountEmail = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL");
    const privateKey = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY")?.replace(/\\n/g, "\n");

    if (!serviceAccountEmail || !privateKey) {
      console.error("Missing required environment variables");
      return new Response(
        JSON.stringify({ error: "Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ✅ HANDLE DELETE REQUEST
    if (req.method === "DELETE") {
      if (!body.sessionId) {
        return new Response(
          JSON.stringify({ error: "Missing sessionId for deletion" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

      if (!supabaseUrl || !supabaseServiceRoleKey) {
        console.error("Missing Supabase environment variables");
        return new Response(
          JSON.stringify({ error: "Server configuration error" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

      // Get the google_event_id from the session
      const { data: sessionData, error: fetchError } = await supabase
        .from("sessions")
        .select("google_event_id")
        .eq("id", body.sessionId)
        .single();

      if (fetchError || !sessionData?.google_event_id) {
        console.warn(`No google_event_id found for session ${body.sessionId}`);
        return new Response(
          JSON.stringify({ success: true, message: "Session has no Google Calendar event to delete" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Delete from Google Calendar
      try {
        const token = await getAccessToken(serviceAccountEmail, privateKey);

        const deleteRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${sessionData.google_event_id}?sendNotifications=true`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!deleteRes.ok && deleteRes.status !== 404) {
          const errorText = await deleteRes.text();
          console.error(`Calendar API delete error (${deleteRes.status}):`, errorText);
          throw new Error(`Calendar API error: ${deleteRes.status}`);
        }

        console.log(`Successfully deleted calendar event: ${sessionData.google_event_id}`);
      } catch (calendarError) {
        console.warn("Could not delete from Google Calendar:", calendarError);
        // Continue anyway - we still want to clear the event ID from the session
      }

      // Clear the google_event_id from the session
      const { error: updateError } = await supabase
        .from("sessions")
        .update({ google_event_id: null })
        .eq("id", body.sessionId);

      if (updateError) {
        console.error("Error clearing google_event_id:", updateError);
        return new Response(
          JSON.stringify({ error: "Failed to clear event ID from session" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: "Calendar event deleted successfully" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ✅ HANDLE POST & PATCH REQUESTS (CREATE/UPDATE)
    // Validate required fields
    if (!body.title || !body.startDateTime || !body.endDateTime) {
      console.error("Missing required fields:", { title: body.title, startDateTime: body.startDateTime, endDateTime: body.endDateTime });
      return new Response(
        JSON.stringify({ error: "Missing required fields: title, startDateTime, endDateTime" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const attendees = buildAttendees(body);   // ✅ SAFE LOGIC

    // Build base event with meeting link in location and description if available
    const initialLink = body.meetingLink?.trim();
    let initialDescription = body.description || "";
    if (initialLink && !initialDescription.includes(initialLink)) {
      initialDescription = `🔗 MEETING LINK:\n${initialLink}\n\n${initialDescription}`.trim();
    }

    const event: any = {
      summary: body.title,
      description: initialDescription,
      start: { dateTime: body.startDateTime, timeZone: "UTC" },
      end: { dateTime: body.endDateTime, timeZone: "UTC" },
      attendees,
    };
    if (initialLink) {
      event.location = initialLink;
    }

    let eventId = null;
    let hangoutLink = null;
    let isUpdate = false;

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error("Missing Supabase environment variables");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    if (req.method === "PATCH" && body.sessionId) {
      // Lookup existing event ID
      const { data: sessionData } = await supabase
        .from("sessions")
        .select("google_event_id, meeting_link")
        .eq("id", body.sessionId)
        .single();
        
      if (sessionData?.google_event_id) {
        isUpdate = true;
        const currentLink = body.meetingLink || sessionData.meeting_link;
        if (currentLink) {
          event.location = currentLink;
          if (!event.description.includes(currentLink)) {
            event.description = `🔗 MEETING LINK:\n${currentLink}\n\n${body.description || ""}`.trim();
          }
        }
        const result = await updateCalendarEvent(sessionData.google_event_id, event, serviceAccountEmail, privateKey);
        eventId = result.eventId;
        // Keep the existing meeting link or use the one returned by the API
        hangoutLink = result.hangoutLink || currentLink;
        console.log(`Successfully updated calendar event: ${eventId} with location: ${currentLink}`);
      }
    }

    if (!isUpdate) {
      // Add conference data to create a NEW meet link
      event.conferenceData = {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      };
      const result = await createCalendarEvent(event, serviceAccountEmail, privateKey);
      eventId = result.eventId;
      hangoutLink = result.hangoutLink || initialLink;
      console.log(`Successfully created calendar event: ${eventId}, meet link: ${hangoutLink}`);

      // ✅ CRITICAL: Immediately patch the calendar event with the newly created Meet link
      // so the event in Google Calendar has location and description with the link!
      if (hangoutLink && eventId) {
        try {
          const patchedDescription = `🔗 JOIN MEETING LINK:\n${hangoutLink}\n\n${body.description || ""}`.trim();
          await updateCalendarEvent(
            eventId,
            {
              location: hangoutLink,
              description: patchedDescription,
            },
            serviceAccountEmail,
            privateKey
          );
          console.log(`Successfully patched Google Calendar event with location and description meet link: ${hangoutLink}`);
        } catch (patchErr) {
          console.warn("Could not patch calendar event with location/description:", patchErr);
        }
      }
    }

    // ✅ TRY TO ASSIGN COHOSTS
    if (hangoutLink && (body.volunteerEmail || body.facilitatorEmail || body.volunteerEmails?.length)) {
      try {
        const spaceIdMatch = hangoutLink.match(/meet\.google\.com\/([^?]+)/);
        if (spaceIdMatch) {
          const spaceId = spaceIdMatch[1];
          const meetToken = await getAccessToken(
            serviceAccountEmail, 
            privateKey,
            "https://www.googleapis.com/auth/meetings.space.created"
          );
          
          // Emails to make cohost
          const cohostEmails = [
            ...(body.volunteerEmails || []),
            body.volunteerEmail,
            body.facilitatorEmail,
            body.coordinatorEmail,
            body.classEmail,
            body.centreEmail
          ].filter(e => !!e);
          
          for (const email of new Set(cohostEmails)) {
            const res = await fetch(`https://meet.googleapis.com/v2beta/spaces/${spaceId}/members`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${meetToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ email: email, role: 'COHOST' })
            });
            if (!res.ok) console.warn(`COHOST assign failed for ${email}: ${await res.text()}`);
            else console.log(`Successfully assigned COHOST to ${email}`);
          }
        }
      } catch (err) {
        console.warn("Failed to assign cohosts:", err);
      }
    }

    // ✅ UPDATE SESSION WITH GOOGLE EVENT ID AND MEET LINK
    if (body.sessionId) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

      if (!supabaseUrl || !supabaseServiceRoleKey) {
        console.error("Missing Supabase environment variables");
        return new Response(
          JSON.stringify({ 
            error: "Server configuration error",
            warning: "Calendar event created but couldn't update session with eventId"
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

      const { error: updateError } = await supabase
        .from("sessions")
        .update({ google_event_id: eventId, meeting_link: hangoutLink })
        .eq("id", body.sessionId);

      if (updateError) {
        console.error("Error updating session with google_event_id:", updateError);
        return new Response(
          JSON.stringify({ 
            error: "Failed to update session with eventId",
            details: updateError.message,
            warning: "Calendar event created but couldn't link to session"
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`Successfully updated session ${body.sessionId} with google_event_id: ${eventId}`);
    }

    return new Response(
      JSON.stringify({ success: true, eventId, hangoutLink }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("Calendar sync error:", errorMessage);
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
