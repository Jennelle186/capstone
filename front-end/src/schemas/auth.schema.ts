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

export const signupSchema = z
  .object({
    email: z.email(),
    password: passwordSchema,
    passwordConfirm: z.string(),
    agree: z
      .boolean()
      .refine((val) => val === true, {
        message: "You must agree to the Terms and Privacy Policy",
      }),
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

export type SignupFormData = z.infer<typeof signupSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email({ message: "Enter a valid email address" }),
});

export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    code: z.string().min(6, { message: "Enter the 6-digit code" }),
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

export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

export const changeEmailSchema = z
  .object({
    currentEmail: z
      .string()
      .email({ message: "Enter a valid current email address" }),
    newEmail: z.string().email({ message: "Enter a valid new email address" }),
    confirmEmail: z
      .string()
      .email({ message: "Confirm your new email address" }),
  })
  .superRefine((data, ctx) => {
    if (data.newEmail !== data.confirmEmail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmEmail"],
        message: "Emails do not match",
      });
    }

    if (data.currentEmail === data.newEmail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["newEmail"],
        message: "New email must be different from current email",
      });
    }
  });

export type ChangeEmailFormData = z.infer<typeof changeEmailSchema>;

export const changeEmailVerifySchema = z.object({
  code: z.string().min(6, { message: "Enter the 6-digit code" }),
});

export type ChangeEmailVerifyFormData = z.infer<typeof changeEmailVerifySchema>;
