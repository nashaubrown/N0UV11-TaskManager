export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message)
  }
}

export const notFound = (what = 'Resource') => new ApiError(404, `${what} not found`, 'not_found')
export const forbidden = (msg = 'You do not have permission to do that') => new ApiError(403, msg, 'forbidden')
export const badRequest = (msg: string) => new ApiError(400, msg, 'bad_request')
export const unauthorized = (msg = 'Authentication required') => new ApiError(401, msg, 'unauthorized')
