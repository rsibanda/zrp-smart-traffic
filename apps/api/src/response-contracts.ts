import { OpenAPIObject } from '@nestjs/swagger';
import { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

const text: SchemaObject = { type: 'string' };
const uuid: SchemaObject = { type: 'string', format: 'uuid' };
const date: SchemaObject = { type: 'string', format: 'date-time' };
const count: SchemaObject = { type: 'integer', minimum: 0 };
const flag: SchemaObject = { type: 'boolean' };
const coordinate: SchemaObject = { type: 'number', nullable: true };
const optional = (schema: SchemaObject): SchemaObject => ({
  ...schema,
  nullable: true,
});
const array = (items: SchemaObject): SchemaObject => ({ type: 'array', items });
const object = (
  properties: Record<string, SchemaObject>,
  required = Object.keys(properties),
): SchemaObject => ({ type: 'object', properties, required });
const page = (items: SchemaObject): SchemaObject =>
  object({ items: array(items), total: count, page: count, pageSize: count });
const user = object({
  id: uuid,
  name: text,
  email: { type: 'string', format: 'email' },
  role: { type: 'string', enum: ['USER', 'OFFICER', 'SUPERVISOR', 'ADMIN'] },
});
const account = object({
  ...user.properties,
  active: flag,
  supervisorId: optional(uuid),
  createdAt: date,
} as Record<string, SchemaObject>);
const category = object({
  id: uuid,
  code: text,
  name: text,
  description: text,
  demoFineAmount: {
    type: 'string',
    description: 'Decimal fine amount',
  },
  demeritPoints: count,
  paymentDueDays: count,
  active: flag,
});
const paymentAttempt = object({
  reference: text,
  amount: text,
  currency: text,
  method: text,
  status: text,
  last4: optional(text),
  createdAt: date,
  paidAt: optional(date),
  receiptReference: optional(text),
  failureReason: optional(text),
  simulated: flag,
});
const motoristTicket = object({
  displayReference: text,
  receiptPaymentReference: optional(text),
  reference: text,
  amount: text,
  currency: text,
  status: text,
  paymentStatus: text,
  demeritPoints: count,
  issuedAt: date,
  dueAt: optional(date),
  category: text,
  description: text,
  registration: text,
  location: text,
  officer: text,
  serviceNumber: optional(text),
  paidAt: optional(date),
  receiptReference: optional(text),
  timeline: array(object({ status: text, at: date })),
});
const vehicle = object(
  {
    id: uuid,
    registrationNumber: text,
    make: text,
    model: text,
    colour: text,
    registrationStatus: text,
    driverId: optional(uuid),
    driver: optional(object({ fullName: text, licenceStatus: text })),
    motorist: optional(object({ name: text })),
  },
  [
    'id',
    'registrationNumber',
    'make',
    'model',
    'colour',
    'registrationStatus',
    'driverId',
  ],
);
const ticket = object({
  displayReference: text,
  id: uuid,
  offenceId: uuid,
  publicReference: text,
  demoFineAmountSnapshot: text,
  demeritPointsSnapshot: count,
  motoristId: optional(uuid),
  dueAt: optional(date),
  status: { type: 'string', enum: ['ISSUED', 'CANCELLED'] },
  issuedAt: date,
});
const offence = object({
  id: uuid,
  officerId: uuid,
  supervisorId: uuid,
  vehicleId: uuid,
  categoryId: uuid,
  requestKey: uuid,
  location: text,
  notes: text,
  latitude: coordinate,
  longitude: coordinate,
  observedAt: date,
  createdAt: date,
  status: {
    type: 'string',
    enum: ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'CONFIRMED', 'CANCELLED'],
  },
  revision: count,
  reviewedAt: optional(date),
  reviewNotes: optional(text),
  vehicle,
  category,
  ticket: optional(ticket),
});
const incident = object({
  id: uuid,
  requestKey: uuid,
  reportedBy: optional(uuid),
  source: text,
  supervisorId: uuid,
  type: text,
  description: text,
  location: text,
  latitude: coordinate,
  longitude: coordinate,
  status: text,
  resolutionNotes: optional(text),
  createdAt: date,
  updatedAt: date,
});
const checkpoint = object({
  id: uuid,
  name: text,
  location: text,
  latitude: { type: 'number' },
  longitude: { type: 'number' },
  startAt: date,
  endAt: date,
  status: { type: 'string', enum: ['PLANNED', 'ACTIVE', 'CLOSED'] },
  createdBy: uuid,
  createdAt: date,
});
const audit = object({
  id: uuid,
  actorId: optional(uuid),
  action: text,
  entityType: text,
  entityId: text,
  timestamp: date,
  safeMetadata: { type: 'object', nullable: true, additionalProperties: true },
});
const evidence = object({
  id: uuid,
  mimeType: { type: 'string', enum: ['image/jpeg'] },
  byteSize: count,
  createdAt: date,
});
const alert = object({
  id: uuid,
  title: text,
  message: text,
  active: flag,
  createdBy: uuid,
  createdAt: date,
});
const publicTicket = object({
  displayReference: text,
  currency: text,
  warning: text,
  reference: text,
  demoAmount: text,
  status: text,
  issuedAt: date,
  category: text,
  paymentStatus: { type: 'string', enum: ['NOT_SIMULATED', 'SIMULATED_PAID'] },
  simulatedAt: optional(date),
  receiptReference: optional(text),
});
const settings = object({ publicNotice: text, key: text, updatedAt: date }, [
  'publicNotice',
]);
const overview = object({
  demo: flag,
  openIncidents: count,
  submittedOffences: count,
  activeCheckpoints: count,
  tickets: array(object({ status: text, count })),
  trend: array(object({ day: { type: 'string', format: 'date' }, count })),
  officers: array(
    object({
      id: uuid,
      name: text,
      active: flag,
      _count: object({ offences: count, incidents: count }),
    }),
  ),
});
const security = object({
  activeUsers: count,
  activeSessions: count,
  failedLoginsLast24Hours: count,
  events: array(
    object({
      ...audit.properties,
      actor: optional(object({ name: text, role: text })),
    } as Record<string, SchemaObject>),
  ),
  sessionMinutes: count,
  loginLimitPerMinute: count,
  permissions: { type: 'object', additionalProperties: array(text) },
});

// Explicit safe response contracts are independent from Prisma's sensitive persistence fields.
const contracts: Record<string, SchemaObject> = {
  'post /auth/login': object({ token: text, expiresAt: date, user }),
  'get /auth/me': user,
  'get /vehicles': object({ items: array(vehicle) }),
  'get /vehicles/{id}': vehicle,
  'get /offence-categories': array(category),
  'post /offences': offence,
  'get /offences': page(offence),
  'get /offences/{id}': offence,
  'patch /offences/{id}': offence,
  'post /offences/{id}/discard': object(
    Object.fromEntries(
      Object.entries(offence.properties!).filter(
        ([key]) => !['vehicle', 'category', 'ticket'].includes(key),
      ),
    ) as Record<string, SchemaObject>,
  ),
  'post /offences/{id}/submit': ticket,
  'post /offences/{id}/review': offence,
  'get /tickets/{id}': object({
    ...ticket.properties,
    disclaimer: text,
  } as Record<string, SchemaObject>),
  'get /audit-events': page(audit),
  'get /admin/users': page(account),
  'post /admin/users': account,
  'patch /admin/users/{id}': account,
  'get /admin/supervisors': array(user),
  'get /admin/categories': array(category),
  'post /admin/categories': category,
  'patch /admin/categories/{id}': category,
  'get /admin/settings': settings,
  'patch /admin/settings': settings,
  'get /admin/security': security,
  'get /incidents': page(
    object({
      ...incident.properties,
      reporter: optional(object({ id: uuid, name: text })),
    } as Record<string, SchemaObject>),
  ),
  'post /incidents': incident,
  'patch /incidents/{id}': incident,
  'get /checkpoints': page(checkpoint),
  'post /checkpoints': checkpoint,
  'patch /checkpoints/{id}': checkpoint,
  'get /analytics/overview': overview,
  'get /offences/{id}/evidence': array(evidence),
  'post /offences/{id}/evidence': evidence,
  'get /alerts': array(alert),
  'post /alerts': alert,
  'patch /alerts/{id}': alert,
  'post /tickets/{id}/access-code': object({
    warning: text,
    reference: text,
    displayReference: text,
    verificationCode: text,
  }),
  'get /health': object({ status: { type: 'string', enum: ['ok'] } }),
  'get /public/notices': object({
    warning: text,
    notice: text,
    alerts: array(
      object({ id: uuid, title: text, message: text, createdAt: date }),
    ),
  }),
  'post /public/incidents': object({ warning: text, message: text }),
  'post /public/tickets/verify': object({
    token: text,
    expiresAt: date,
    ticket: publicTicket,
  }),
  'get /public/tickets/current': publicTicket,
  'post /public/tickets/payment-simulation': publicTicket,
};
export function addResponseContracts(document: OpenAPIObject) {
  Object.assign(contracts, {
    'post /admin/motorist-links': object({
      registration: text,
      motorist: text,
      message: text,
    }),
    'get /motorist/dashboard': object({
      totalPayable: { type: 'number' },
      pendingFines: count,
      demeritPoints: count,
      paidFines: count,
      registeredVehicles: count,
      currency: text,
    }),
    'get /motorist/infringements': page(motoristTicket),
    'get /motorist/infringements/{reference}': object({
      ...motoristTicket.properties,
      payments: array(paymentAttempt),
    }),
    'get /motorist/vehicles': page(
      object({
        activeInfringements: count,
        totalPayable: { type: 'number' },
        registrationNumber: text,
        make: text,
        model: text,
        colour: text,
        registrationStatus: text,
      }),
    ),
    'get /motorist/incidents': page(
      object({
        type: text,
        location: text,
        description: text,
        status: text,
        createdAt: date,
      }),
    ),
    'get /motorist/payments': page(
      object({
        ...paymentAttempt.properties,
        ticketDisplayReference: text,
        ticketReference: text,
      }),
    ),
    'post /motorist/payments': paymentAttempt,
    'post /motorist/payments/{reference}/outcome': paymentAttempt,
    'get /motorist/payments/{reference}/receipt': object({
      ...paymentAttempt.properties,
      ticketDisplayReference: text,
      ticketReference: text,
      motorist: text,
      registration: text,
      offence: text,
      notice: text,
    }),
  });
  for (const [path, operations] of Object.entries(document.paths)) {
    for (const method of ['get', 'post', 'patch'] as const) {
      const operation = operations[method];
      if (!operation) continue;
      const route = path.replace(/^\/api\/v1/, '');
      const schema = contracts[`${method} ${route}`];
      for (const [status, response] of Object.entries(operation.responses)) {
        if (
          !response ||
          !status.startsWith('2') ||
          status === '204' ||
          '$ref' in response
        )
          continue;
        if (route === '/evidence/{id}')
          response.content = {
            'image/jpeg': { schema: { type: 'string', format: 'binary' } },
          };
        else if (schema) response.content = { 'application/json': { schema } };
        else throw new Error(`Missing response contract: ${method} ${route}`);
        response.description = 'Successful response.';
      }
      for (const status of ['400', '401', '403', '404', '409', '413', '429'])
        operation.responses[status] ??= {
          description:
            'Validation, authentication, authorization, conflict or request limit error where applicable.',
          content: {
            'application/json': {
              schema: object(
                {
                  statusCode: count,
                  message: { oneOf: [text, array(text)] },
                  error: text,
                },
                ['statusCode', 'message'],
              ),
            },
          },
        };
    }
  }
}
