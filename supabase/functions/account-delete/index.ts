import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    console.log('[account-delete] Missing bearer token');
    return jsonResponse(401, { success: false, error: 'Missing bearer token.' });
  }

  const serviceRoleClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const accessToken = authHeader.replace('Bearer ', '').trim();

  try {
    console.log('[account-delete] Validating user token');
    const {
      data: { user },
      error: userError,
    } = await serviceRoleClient.auth.getUser(accessToken);

    if (userError || !user) {
      console.log('[account-delete] Unable to resolve user from token:', userError?.message);
      return jsonResponse(401, {
        success: false,
        error: userError?.message || 'Could not authenticate user.',
      });
    }

    const userId = user.id;
    console.log('[account-delete] Starting cleanup for user:', userId);

    const { data: ownedTruckRows, error: ownedTruckError } = await serviceRoleClient
      .from('trucks')
      .select('id')
      .eq('owner_id', userId);

    if (ownedTruckError) {
      console.log('[account-delete] Failed to fetch owned trucks:', ownedTruckError.message);
      return jsonResponse(500, { success: false, error: ownedTruckError.message });
    }

    const ownedTruckIds = (ownedTruckRows ?? [])
      .map((row: { id: string | number | null }) => row.id?.toString())
      .filter((id): id is string => !!id);

    console.log('[account-delete] Owned trucks found:', ownedTruckIds);

    if (ownedTruckIds.length > 0) {
      const { error: truckFavoritesError } = await serviceRoleClient
        .from('favorites')
        .delete()
        .in('truck_id', ownedTruckIds);

      if (truckFavoritesError) {
        console.log('[account-delete] Failed deleting favorites for owned trucks:', truckFavoritesError.message);
        return jsonResponse(500, { success: false, error: truckFavoritesError.message });
      }

      const { error: truckReviewsError } = await serviceRoleClient
        .from('reviews')
        .delete()
        .in('truck_id', ownedTruckIds);

      if (truckReviewsError) {
        console.log('[account-delete] Failed deleting reviews for owned trucks:', truckReviewsError.message);
        return jsonResponse(500, { success: false, error: truckReviewsError.message });
      }

      const { error: truckLocationsError } = await serviceRoleClient
        .from('locations')
        .delete()
        .in('truck_id', ownedTruckIds);

      if (truckLocationsError) {
        console.log('[account-delete] Failed deleting locations for owned trucks:', truckLocationsError.message);
        return jsonResponse(500, { success: false, error: truckLocationsError.message });
      }

      const { error: trucksError } = await serviceRoleClient
        .from('trucks')
        .delete()
        .eq('owner_id', userId);

      if (trucksError) {
        console.log('[account-delete] Failed deleting owned trucks:', trucksError.message);
        return jsonResponse(500, { success: false, error: trucksError.message });
      }
    }

    const { error: favoritesError } = await serviceRoleClient
      .from('favorites')
      .delete()
      .eq('user_id', userId);

    if (favoritesError) {
      console.log('[account-delete] Failed deleting user favorites:', favoritesError.message);
      return jsonResponse(500, { success: false, error: favoritesError.message });
    }

    const { error: reviewsError } = await serviceRoleClient
      .from('reviews')
      .delete()
      .eq('user_id', userId);

    if (reviewsError) {
      console.log('[account-delete] Failed deleting user reviews:', reviewsError.message);
      return jsonResponse(500, { success: false, error: reviewsError.message });
    }

    const { error: profileError } = await serviceRoleClient
      .from('profiles')
      .delete()
      .eq('id', userId);

    if (profileError) {
      console.log('[account-delete] Failed deleting profile:', profileError.message);
      return jsonResponse(500, { success: false, error: profileError.message });
    }

    const { error: authDeleteError } = await serviceRoleClient.auth.admin.deleteUser(userId);

    if (authDeleteError) {
      console.log('[account-delete] Failed deleting auth user:', authDeleteError.message);
      return jsonResponse(500, { success: false, error: authDeleteError.message });
    }

    console.log('[account-delete] Account deletion completed for user:', userId);
    return jsonResponse(200, {
      success: true,
      userId,
      deletedTruckIds: ownedTruckIds,
    });
  } catch (error: any) {
    console.log('[account-delete] Unexpected error:', error?.message || error);
    return jsonResponse(500, {
      success: false,
      error: error?.message || 'Unexpected account-delete error.',
    });
  }
});
