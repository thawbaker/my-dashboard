import { z } from 'zod';

// Password validation: min 6 chars, at least 1 uppercase, 1 special character
const passwordSchema = z.string()
  .min(6, 'Password must be at least 6 characters long')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, 'Password must contain at least one special character');

// Name validation: no numbers allowed
const nameSchema = z.string()
  .min(1, 'Name is required')
  .regex(/^[a-zA-Z\s]+$/, 'Name cannot contain numbers or special characters');

// Username: unique, filesystem-safe (it becomes the per-user DB filename
// user-data/<username>.db — see src/lib/user-db.ts). Must match
// USERNAME_PATTERN there.
const usernameSchema = z.string()
  .min(2, 'Username must be at least 2 characters')
  .max(32, 'Username must be at most 32 characters')
  .regex(
    /^[a-z0-9][a-z0-9._-]{1,31}$/i,
    'Username may only use letters, numbers, dots, dashes, and underscores, and must start with a letter or number'
  );

// Email validation
const emailSchema = z.string()
  .email('Please enter a valid email address');

export const signUpSchema = z.object({
  name: nameSchema,
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

// Admin-provisioned account (role may be set; public sign-up is always 'user')
export const signUpAdminUserSchema = z.object({
  name: nameSchema,
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(['user', 'admin']),
});

export const appSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  url: z.string().min(1, 'URL is required').default('#'),
  icon: z.string().min(1, 'Icon is required').default('layout-grid'),
  // Admin-only apps are hidden from every non-admin user's launcher.
  adminOnly: z.boolean().default(false),
});

// Partial update — no defaults, so unspecified fields are left untouched
export const updateAppSchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  url: z.string().min(1, 'URL is required').optional(),
  icon: z.string().min(1, 'Icon is required').optional(),
  enabled: z.boolean().optional(),
  adminOnly: z.boolean().optional(),
});

// Denylist: app ids the user CANNOT access
export const permissionsSchema = z.object({
  blockedAppIds: z.array(z.number().int().positive()),
});

export const toggleDisabledSchema = z.object({
  disabled: z.boolean(),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpAdminUserInput = z.infer<typeof signUpAdminUserSchema>;
export type AppInput = z.infer<typeof appSchema>;
export type UpdateAppInput = z.infer<typeof updateAppSchema>;
export type PermissionsInput = z.infer<typeof permissionsSchema>;
export type ToggleDisabledInput = z.infer<typeof toggleDisabledSchema>;
