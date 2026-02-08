//auth types for the login and sign up with email and password
import {z} from 'zod';

const passwordSchema = z
    .string()
    .min(6, { message: "Minimum 6 characters" })
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
    })

//zod for the sign up to check if the password and confirm password match
export const passwordMatchSchema = z
  .object({
    password: passwordSchema,
    passwordConfirm: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.passwordConfirm) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["passwordConfirm"],
        message: "password do not match",
      });
    }
  });


export const loginSchema = z.object({
    email: z.email(),
    password: passwordSchema
});

export type LoginFormData = z.infer<typeof loginSchema>;
