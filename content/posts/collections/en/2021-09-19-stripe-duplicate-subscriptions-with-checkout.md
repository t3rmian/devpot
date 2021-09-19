---
title: Stripe Checkout – subscription deduplication
url: stripe-checkout-subscription-deduplication
id: 75
tags:
  - api
  - rest
author: Damian Terlecki
date: 2021-09-19T20:00:00
---

Stripe is one of the leading services on the payment gateway market.
It stands out from its competitors with a very well-documented API that allows you to implement various use cases.
Probably the easiest payment system integration is available through the Stripe Checkout.
It is a web application that gives you the ability to make one-time or recurring (subscription) payments for a product.

### Stripe Checkout integration

Stripe Checkout makes it very easy to implement a subscription system in your application.
The integration looks pretty standard, and you will catch it on after reviewing the documentation.
After providing the configuration values (product, price, payment type, recurrence) to the API, you receive a link to the so-called session, [active for 24 hours](https://stripe.com/docs/payments/accept-a-payment#:~:text=Checkout%20Sessions%20expire%2024%20hours%20after%20creation.).
Next, the customer visits the Stripe page and fills in the data required for the payment.
After finalizing the transaction, the application redirects the customer to our store's website.
At the same time, a notification about this event is sent to the application (webhook).
As a result of a paid invoice or subscription update, you can grant the user additional rights or take care of completing the order.

Although you will find the invoice and subscription fields in the [Stripe Checkout session](https://stripe.com/docs/api/checkout/sessions), both will be empty until the payment is made.
Only after the transaction is finalized will the related objects be created, and (using the expand parameters) you will be able to fetch data required for the subscription management.

### Duplicate subscription problem

Stripe Checkout does not address the issue of duplication and allows multiple subscriptions to the same product.
Due to the lack of an interface to manage sessions and their activity for 24 hours, our application must take into account the
possibility of a single user subscribing to a product multiple times, resulting in multiple billings.

<img src="/img/hq/stripe-payments-dashboard.png" alt="Duplicate customer payments on Stripe Dashboard" title="Duplicate customer payments on Stripe Dashboard">

In this situation, we can think of several workarounds:
- canceling the duplicate subscription:
  - [refunding the payment](https://stripe.com/docs/api/refunds/create) (the store will lose on the transaction fees of the original payment);
  - crediting the unused time to subsequent transactions – i.e. canceling the subscription with the [`prorate=true`](https://stripe.com/docs/api/subscriptions/cancel#cancel_subscription-prorate) parameter;
  - extending the first subscription – i.e. canceling the subscription and [updating](https://stripe.com/docs/billing/subscriptions/billing-cycle#changing) the other one with the parameter `proration_behavior=none`;
- initializing a deferred payment session by [adding a trial period](https://stripe.com/docs/billing/subscriptions/trials), sufficient for active sessions expiration and deduplication of subscriptions;
- initializing a session in `mode=setup` mode – i.e. saving the payment data for the future (unfortunately without the price information on the page itself) and idempotently creating the subscription directly from our application.

I do not recommend using the [`Idempotency-Key`](https://stripe.com/docs/api/idempotent_requests), unless we have a rare situation where the query that initializes the session will not change for 24 hours.
Even for a single product offered by a store, a better solution would be to store the session ID in the database for reuse.
On the other hand, the key will work well in cases of direct billing by the application.

Due to deduplication, an important aspect is to create the customer object first and assign it to a session.
Despite the rarity of the described duplication problem, any deviation from the standard behavior of a store, even if compliant with your policy, can become technical debt.

## Summary

Stripe Checkout is a very quick and easy way to integrate payments into an application.
When choosing this option, it is worth taking into account the issue of payment duplication, which is not implemented in the Checkout Session API (version 2020-08-27).
Such functionality can be achieved by implementing the process in your application – the duplicate subscriptions cancellation or direct subscription creation.

If you need more control over the whole process, you might consider moving some of the steps to your site.
In such a case, the [Stripe.js & Elements](https://stripe.dev/elements-examples/) library can help you meet the latest standards.
