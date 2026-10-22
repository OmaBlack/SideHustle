import { schema } from '@sidehustle/db';
import { CartLineInput, CartMergeInput, CartQtyInput } from '@sidehustle/schemas';
import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireUser } from '../../lib/auth.js';
import { loadPricingContext } from '../../lib/pricing.js';
import { badRequest, notFound } from '../../lib/problems.js';
import { acknowledge, addLine, cartId, cartView } from './service.js';

const LineId = z.object({ id: z.string().uuid() });

export const cartRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db } = app.deps;

  app.get('/cart', { schema: { tags: ['cart'] } }, async (req) => ({
    cart: await cartView(db, requireUser(req).id),
  }));

  app.post('/cart/lines', { schema: { tags: ['cart'], body: CartLineInput } }, async (req, reply) => {
    const u = requireUser(req);
    const ctx = await loadPricingContext(db);
    await db.transaction(async (tx) => {
      const id = await addLine(tx, u.id, req.body, ctx);
      await acknowledge(tx, u.id, ctx, [id]);
    });
    return reply.status(201).send({ cart: await cartView(db, u.id, ctx) });
  });

  // Logged-out drafts kept in sessionStorage merge into the account after login (plan section 9).
  app.post('/cart/merge', { schema: { tags: ['cart'], body: CartMergeInput } }, async (req) => {
    const u = requireUser(req);
    const ctx = await loadPricingContext(db);
    let skipped = 0;
    await db.transaction(async (tx) => {
      const ids: string[] = [];
      for (const line of req.body.lines) {
        // A draft line that no longer prices (product gone, option removed) is dropped, not fatal.
        try {
          ids.push(await tx.transaction(async (sp) => addLine(sp, u.id, line, ctx)));
        } catch {
          skipped++;
        }
      }
      await acknowledge(tx, u.id, ctx, ids);
    });
    return { cart: await cartView(db, u.id, ctx), skipped };
  });

  app.patch(
    '/cart/lines/:id',
    { schema: { tags: ['cart'], params: LineId, body: CartQtyInput } },
    async (req) => {
      const u = requireUser(req);
      const cid = await cartId(db, u.id);
      const [line] = await db
        .select()
        .from(schema.cartLines)
        .where(and(eq(schema.cartLines.id, req.params.id), eq(schema.cartLines.cartId, cid)));
      if (!line) throw notFound('Cart line not found');
      if (line.lineType !== 'product' && req.body.qty !== 1)
        throw badRequest('KIT_QTY', 'Kits are bought one at a time');
      const ctx = await loadPricingContext(db);
      await db.update(schema.cartLines).set({ qty: req.body.qty }).where(eq(schema.cartLines.id, line.id));
      await acknowledge(db, u.id, ctx, [line.id]);
      return { cart: await cartView(db, u.id, ctx) };
    },
  );

  app.delete('/cart/lines/:id', { schema: { tags: ['cart'], params: LineId } }, async (req) => {
    const u = requireUser(req);
    const cid = await cartId(db, u.id);
    await db
      .delete(schema.cartLines)
      .where(and(eq(schema.cartLines.id, req.params.id), eq(schema.cartLines.cartId, cid)));
    return { cart: await cartView(db, u.id) };
  });

  app.post('/cart/ack', { schema: { tags: ['cart'] } }, async (req) => {
    const u = requireUser(req);
    const ctx = await loadPricingContext(db);
    await acknowledge(db, u.id, ctx);
    return { cart: await cartView(db, u.id, ctx) };
  });
};
