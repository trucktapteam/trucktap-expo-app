import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure } from "../create-context";
import { supabase } from "../../../lib/supabase";

export const userRouter = createTRPCRouter({
  updateProfile: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        displayName: z.string().min(1).max(100),
        photoUrl: z.string().url().optional().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      console.log("=== HIT updateProfile mutation ===");
      console.log("updateProfile input:", JSON.stringify(input, null, 2));

      const { data, error } = await supabase
        .from("profiles")
        .update({
          display_name: input.displayName,
          profile_photo: input.photoUrl ?? null,
        })
        .eq("id", input.userId)
        .select("id, display_name, profile_photo")
        .single();

      console.log("updateProfile supabase data:", JSON.stringify(data, null, 2));
      console.log("updateProfile supabase error:", JSON.stringify(error, null, 2));

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message || "Failed to update profile",
        });
      }

      if (!data) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Profile not found after update",
        });
      }

      const response = {
        success: true,
        user: {
          id: data.id,
          name: data.display_name,
          profile_photo: data.profile_photo,
        },
      };

      console.log("updateProfile response:", JSON.stringify(response, null, 2));

      return response;
    }),
 });