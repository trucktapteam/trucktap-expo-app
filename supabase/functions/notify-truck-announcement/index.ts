import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const { truckId, message } = await req.json();

    if (!truckId || !message) {
      return new Response('Missing truckId or message', { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get users who want announcement notifications and have push tokens
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('push_token')
      .eq('notify_announcements', true)
      .not('push_token', 'is', null);

    if (profilesError) {
      console.log('Error fetching profiles:', profilesError.message);
      return new Response('Error fetching profiles', { status: 500 });
    }

    if (!profiles || profiles.length === 0) {
      console.log('No users to notify');
      return new Response('No users to notify');
    }

    console.log("Users to notify:", profiles.length);

    const messages = profiles.map((p) => ({
      to: p.push_token,
      sound: 'default',
      title: 'New Truck Update 🚛',
      body: message,
    }));

    const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(messages),
});

const expoJson = await expoRes.json();
console.log('Expo response:', JSON.stringify(expoJson, null, 2));

return new Response(
  JSON.stringify({ success: true, expoResult: expoJson }),
  {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }
);
  } catch (err: any) {
    console.log('notify-truck-announcement error:', err?.message || err);
    return new Response('Server error', { status: 500 });
  }
});