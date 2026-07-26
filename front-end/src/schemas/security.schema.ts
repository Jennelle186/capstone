import { z } from "zod";

const newPasswordSchema = z
  .string()
  .min(8, { message: "Minimum 8 characters" })
  .refine((password) => /[A-Z]/.test(password), {
    message: "At least one uppercase letter",
  })
  .refine((password) => /[a-z]/.test(password), {
    message: "At least one lowercase letter",
  })
  .refine((password) => /[0-9]/.test(password), {
    message: "At least one number",
  })
  .refine((password) => /[!@#$%^&*]/.test(password), {
    message: "At least one special character",
  });

export const changePasswordSchema = z
  .object({
    newPassword: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.newPassword !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Passwords do not match",
      });
    }
  });

export type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;

export const addEmailSchema = z.object({
  email: z.string().email({ message: "Enter a valid email address" }),
});

export type AddEmailFormData = z.infer<typeof addEmailSchema>;

export const verifyEmailSchema = z.object({
  code: z.string().min(6, { message: "Enter the 6-digit code" }),
});

export type VerifyEmailFormData = z.infer<typeof verifyEmailSchema>;

export const totpCodeSchema = z.object({
  code: z.string().min(6, { message: "Enter the 6-digit code" }),
});

export type TotpCodeFormData = z.infer<typeof totpCodeSchema>;
