"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import {
  subjectSchema,
  hourlyRateSchema,
  assignmentSchema,
  tutorSubjectsSchema,
  idSchema,
} from "@/lib/validation/schemas";
import type { ActionState } from "@/types";
export async function adminAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const admin = await requireRole("admin");
  const db = await createClient();
  const operation = form.get("operation");
  const values = Object.fromEntries(form);
  try {
    let result: { error: { code?: string } | null };
    switch (operation) {
      case "subject_add": {
        const v = subjectSchema.parse(values);
        result = await db.from("subjects").insert(v);
        break;
      }
      case "subject_remove": {
        const v = idSchema.parse(values);
        result = await db
          .from("subjects")
          .update({ is_active: false })
          .eq("id", v.id);
        break;
      }
      case "rate": {
        const v = hourlyRateSchema.parse(values);
        result = await db
          .from("app_settings")
          .update({ ...v, updated_by: admin.id })
          .eq("id", true);
        break;
      }
      case "tutor_subjects": {
        const v = tutorSubjectsSchema.parse({
          ...values,
          subject_ids: form.getAll("subject_ids"),
        });
        result = await db.rpc("set_tutor_subjects", {
          p_tutor: v.tutor_id,
          p_subjects: v.subject_ids,
        });
        break;
      }
      case "assignment": {
        const v = assignmentSchema.parse(values);
        result = await db
          .from("student_tutor_assignments")
          .upsert(
            { ...v, assigned_by: admin.id },
            { onConflict: "student_id,subject_id" },
          );
        break;
      }
      case "assignment_remove": {
        const v = idSchema.parse(values);
        result = await db
          .from("student_tutor_assignments")
          .delete()
          .eq("id", v.id);
        break;
      }
      default:
        return { error: "Неизвестное действие." };
    }
    if (result.error) {
      if (result.error.code === "23505")
        return {
          errors: {
            name: ["Такой предмет уже существует, в том числе среди архивных."],
          },
        };
      if (result.error.code === "23503")
        return {
          error:
            "Предмет используется в назначениях. Сначала измените назначения учеников.",
        };
      return {
        error:
          "Не удалось сохранить. Проверьте, что предмет активен и назначен репетитору.",
      };
    }
    revalidatePath("/admin", "layout");
    revalidatePath("/student", "layout");
    revalidatePath("/tutor", "layout");
    revalidatePath("/apply");
    return {
      success:
        operation === "assignment_remove"
          ? "Назначение снято."
          : "Изменения сохранены.",
    };
  } catch (error) {
    if (error instanceof z.ZodError)
      return { errors: z.flattenError(error).fieldErrors };
    return { error: "Не удалось сохранить изменения. Попробуйте ещё раз." };
  }
}
