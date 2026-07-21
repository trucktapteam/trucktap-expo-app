-- AUTH-002: Add table-level GRANTs that owner_messages, owner_message_reads,
-- and review_replies never received. These are not a regression from the
-- July 19 profile-hardening pass (20260719000000_harden_core_schema_
-- boundaries.sql and 20260719010000_restrict_profile_data_exposure.sql) --
-- neither migration mentions these three tables. The gap predates them: it
-- traces to each table's own creation (20260510000000_owner_messages.sql,
-- 20260621010000_create_review_replies.sql), which defined RLS policies but
-- never granted the underlying table privileges those policies assume.
-- Discovered during AUTH-001 verification. Not an RLS task: no policy is
-- modified here, and RLS continues to be the sole row-level authorization
-- mechanism -- these grants only restore the ability to reach that RLS
-- evaluation at all.
--
-- Audit method: every table in the public schema was checked against
-- information_schema.role_table_grants / role_column_grants, then cross-
-- referenced against actual client usage (grep across app/, contexts/,
-- lib/ for every .from('<table>') call and its .select/.insert/.update/
-- .delete/.upsert columns) so grants match what the app truly does, not
-- what a policy merely permits. Two tables that looked broken from an
-- incomplete table-level-only reading turned out fine on the full,
-- column-level audit and were left untouched:
--   * upcoming_stops -- has working SELECT/INSERT/UPDATE/DELETE for every
--     column the client actually reads or writes (verified empirically:
--     owner insert/update and anon/owner select all succeed today). It is
--     only missing latitude/longitude/timezone grants, which nothing in
--     the client reads or writes -- not a bug, not touched here.
--   * truck_live_events -- has no INSERT grant for authenticated, but
--     every write goes through the go_live_truck/go_offline_truck
--     SECURITY DEFINER RPCs (contexts/AppContext.tsx), never a direct
--     client insert. Intentionally RPC-only; not touched here.
--
-- Three tables are genuinely missing base grants for operations the
-- client actually performs:
--
-- owner_messages (contexts/AppContext.tsx):
--   - refreshOwnerMessages(): `.select('*')` for any owner/admin -- needs
--     SELECT. RLS ("Truck owners and admins can read owner messages")
--     already restricts which rows are visible.
--   - createOwnerMessage(): `.insert({ title, body, type, created_by,
--     target_scope })`, admin-only client path -- needs INSERT. RLS
--     ("Admins can send owner messages") already restricts who can insert.
--   No client path performs UPDATE or DELETE on this table.
--
-- owner_message_reads (contexts/AppContext.tsx):
--   - refreshOwnerMessages(): `.select('message_id, read_at')` filtered by
--     `.eq('user_id', ...)` -- needs SELECT (the WHERE filter on user_id
--     requires SELECT on that column too, not just the projected ones).
--   - markOwnerUpdatesViewed(): `.upsert({ message_id, user_id, read_at
--     })` -- an upsert needs INSERT for the new-row path and UPDATE for
--     the ON CONFLICT DO UPDATE path (only read_at is ever set).
--   RLS ("Users can mark owner messages read" / "...update own owner
--   message read receipts") already restricts this to the message's
--   owner or targeted truck owner.
--
-- review_replies (contexts/AppContext.tsx):
--   - addReviewReply(): `.insert({ review_id, truck_id, owner_id, body
--     })` -- needs INSERT.
--   - updateReviewReply(): `.update({ body })` -- needs UPDATE.
--   - deleteReviewReply(): also `.update({ deleted_at })` -- this app
--     only ever soft-deletes a reply via UPDATE, never a real DELETE.
--   SELECT already works today (column-level grant already covers every
--   column on this table for both anon and authenticated). No client path
--   performs a real DELETE, so DELETE is not granted here even though an
--   admin DELETE policy exists in the schema -- app behavior is the
--   source of truth for this task; that unused policy is left alone, not
--   acted on.
--
-- Table-level grants are used here (not column-level): nothing on
-- owner_messages, owner_message_reads, or review_replies is sensitive
-- enough to warrant hiding individual columns from an already RLS-gated
-- audience, so restricting grants at the column level would add
-- complexity without a security benefit. (profiles, upcoming_stops, and
-- review_replies' pre-existing SELECT grant use column-level grants
-- elsewhere in this schema for tables that do have sensitive columns --
-- that pattern doesn't apply here.)

grant select, insert
on table public.owner_messages
to authenticated;

grant select, insert, update
on table public.owner_message_reads
to authenticated;

grant insert, update
on table public.review_replies
to authenticated;
