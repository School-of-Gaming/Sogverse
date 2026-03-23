# Stripe Testing

## Test Mode Card Details

- **Card number:** `4242 4242 4242 4242`
- **Expiry:** Any future date (e.g. `12/26`)
- **CVC:** Any 3 digits (e.g. `123`)

## Other Test Cards

| Scenario | Card Number |
|---|---|
| Successful payment | `4242 4242 4242 4242` |
| Requires authentication (3D Secure) | `4000 0025 0000 3155` |
| Declined | `4000 0000 0000 0002` |
| Insufficient funds | `4000 0000 0000 9995` |

See [Stripe testing docs](https://docs.stripe.com/testing) for the full list.
