import { Request, Response, NextFunction } from 'express';
import { registerSchema, loginSchema, refreshSchema } from '../validators/auth.validator.js';
import { ValidationError } from '../utils/errors.js';
import * as authService from '../services/auth.service.js';

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Validation failed', parseResult.error.flatten().fieldErrors);
    }

    const result = await authService.registerUser(parseResult.data);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Validation failed', parseResult.error.flatten().fieldErrors);
    }

    const result = await authService.loginUser(parseResult.data);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parseResult = refreshSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Validation failed', parseResult.error.flatten().fieldErrors);
    }

    const tokens = await authService.refreshAccessToken(parseResult.data.refreshToken);
    res.status(200).json({ success: true, data: { tokens } });
  } catch (error) {
    next(error);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    await authService.logoutUser(userId);
    res.status(200).json({ success: true, data: { message: 'Logged out successfully' } });
  } catch (error) {
    next(error);
  }
}

export async function me(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    const user = await authService.getUserProfile(userId);
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
}
