/**
 * Authentication Middleware
 */

import { Request, Response, NextFunction } from 'express';
import { Database } from '../database';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    username: string;
    secLevel: number;
  };
}

/**
 * Middleware to authenticate JWT access tokens
 */
export const authenticateToken = (db: Database) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    try {
      const decoded = await db.verifyAccessToken(token);
      req.user = decoded;
      next();
    } catch (error) {
      return res.status(403).json({ error: 'Invalid or expired access token' });
    }
  };
};
