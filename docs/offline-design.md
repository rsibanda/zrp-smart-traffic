# Offline operation and recovery

Implemented: clients hold credentials in memory, show timeout/network errors, retain the same UUID and payload for uncertain create requests, and expose recent server records for recovery. Draft submission has one ticket per offence. Evidence deduplicates the re-encoded image. Public simulation has one immutable demo receipt. No background synchronization or unencrypted disk outbox exists.

Editing uses a revision number. A stale edit returns 409; reload the saved draft before retrying. Submitted or discarded drafts cannot be edited. Discard marks a draft CANCELLED and retains audit/evidence instead of deleting history.

After app termination or expired sign-in, reconnect and inspect recent activity before creating a replacement. This online-first limitation is explicit; the UI must not say an offline report is safely saved or submitted.

Optional future encrypted outbox design: bind each encrypted item to the authenticated officer ID, keep its random request key and exact immutable payload, use an Android Keystore-backed encryption key, exclude tokens/evidence from plaintext preferences and backups, and send only after explicit sign-in as the matching officer. States would be LOCAL_DRAFT, READY, SENDING, ACKNOWLEDGED and NEEDS_REVIEW. On uncertain delivery, retry the original request key before allowing edits. Destroy local material only after acknowledged delivery or explicit local discard. Device-lock, account-switch, key-loss, replay, crash and disk-full tests are prerequisites. This is a design, not implemented offline persistence.
