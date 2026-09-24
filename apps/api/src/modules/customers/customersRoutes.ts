import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/requirePermission";
import { PERMISSIONS } from "../rbac/permissions";
import { importCustomersFromCsv, listImportBatches, getImportBatch } from "./importService";
import { listCustomers, getCustomer, createCustomer, updateCustomer, deleteCustomer } from "./customerService";

export const customersRouter = Router();

customersRouter.use(authenticate);

// Memory storage: files are parsed immediately and never written to disk.
// 5MB covers a very large recall list as plain-text CSV; bigger files
// should move to the background-job path noted in importService.ts.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const importMappingSchema = z
  .object({
    branchId: z.string().uuid().optional(),
    mapping: z.record(z.string()).optional(), // { firstName: "Given Name", mobile: "Cell", ... }
  })
  .optional();

customersRouter.post(
  "/import",
  requirePermission(PERMISSIONS.CUSTOMERS_IMPORT),
  upload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: { code: "NO_FILE", message: "No file uploaded (field name: 'file')" } });
        return;
      }

      // multipart/form-data fields arrive as strings - the optional JSON
      // fields (mapping) need parsing before validation.
      const rawBody = { ...req.body };
      if (typeof rawBody.mapping === "string") {
        try {
          rawBody.mapping = JSON.parse(rawBody.mapping);
        } catch {
          res.status(400).json({ error: { code: "INVALID_MAPPING", message: "mapping must be valid JSON" } });
          return;
        }
      }

      const parsed = importMappingSchema.parse(rawBody) ?? {};

      const summary = await importCustomersFromCsv(req.auth!, {
        filename: req.file.originalname,
        buffer: req.file.buffer,
        branchId: parsed.branchId,
        mapping: parsed.mapping,
      });

      res.status(201).json(summary);
    } catch (err) {
      next(err);
    }
  },
);

customersRouter.get(
  "/import/batches",
  requirePermission(PERMISSIONS.CUSTOMERS_IMPORT),
  async (req, res, next) => {
    try {
      res.json(await listImportBatches(req.auth!));
    } catch (err) {
      next(err);
    }
  },
);

customersRouter.get(
  "/import/batches/:id",
  requirePermission(PERMISSIONS.CUSTOMERS_IMPORT),
  async (req, res, next) => {
    try {
      res.json(await getImportBatch(req.auth!, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

customersRouter.get("/", requirePermission(PERMISSIONS.CUSTOMERS_VIEW), async (req, res, next) => {
  try {
    const page = req.query.page ? Number(req.query.page) : undefined;
    const pageSize = req.query.pageSize ? Number(req.query.pageSize) : undefined;
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    res.json(await listCustomers(req.auth!, { page, pageSize, search }));
  } catch (err) {
    next(err);
  }
});

customersRouter.get("/:id", requirePermission(PERMISSIONS.CUSTOMERS_VIEW), async (req, res, next) => {
  try {
    res.json(await getCustomer(req.auth!, req.params.id));
  } catch (err) {
    next(err);
  }
});

const consentStatusSchema = z.enum(["OPTED_IN", "OPTED_OUT", "UNKNOWN"]);

const customerSchema = z.object({
  branchId: z.string().uuid().nullish(),
  firstName: z.string().min(1),
  lastName: z.string().nullish(),
  email: z.string().email().nullish().or(z.literal("")),
  mobile: z.string().nullish(),
  preferredChannel: z.string().nullish(),
  recallDueDate: z.coerce.date().nullish(),
  appointmentType: z.string().nullish(),
  consentStatus: consentStatusSchema.optional(),
});

customersRouter.post("/", requirePermission(PERMISSIONS.CUSTOMERS_EDIT), async (req, res, next) => {
  try {
    const input = customerSchema.parse(req.body);
    res.status(201).json(await createCustomer(req.auth!, { ...input, email: input.email || null }));
  } catch (err) {
    next(err);
  }
});

customersRouter.patch("/:id", requirePermission(PERMISSIONS.CUSTOMERS_EDIT), async (req, res, next) => {
  try {
    const input = customerSchema.partial().parse(req.body);
    res.json(
      await updateCustomer(req.auth!, req.params.id, {
        ...input,
        email: input.email !== undefined ? input.email || null : undefined,
      }),
    );
  } catch (err) {
    next(err);
  }
});

customersRouter.delete("/:id", requirePermission(PERMISSIONS.CUSTOMERS_EDIT), async (req, res, next) => {
  try {
    await deleteCustomer(req.auth!, req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
