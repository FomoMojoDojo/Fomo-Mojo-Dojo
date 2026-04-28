# Review PATCH Contract (MojoMap)

## Purpose
Defines the required structure for all human review decisions written back to Supabase.

This prevents schema drift and field mismatches across workflows.

---

## Fields

{
  "human_decision": "approved | rejected | timed_out",
  "review_status": "reviewed | awaiting_followup",
  "review_source": "human_input"
}

---

## Approved

{
  "human_decision": "approved",
  "review_status": "reviewed",
  "review_source": "human_input"
}

---

## Rejected

{
  "human_decision": "rejected",
  "review_status": "reviewed",
  "review_source": "human_input"
}

---

## Timeout

{
  "human_decision": "timed_out",
  "review_status": "awaiting_followup",
  "review_source": "human_input"
}

---

## Shared HTTP Configuration

- Method: PATCH  
- Endpoint: /rest/v1/companies?id=eq.[company_id]  
- Headers:
  - apikey  
  - Authorization  
  - Content-Type: application/json  
  - Prefer: return=minimal  

---

## Rules

- JSON keys MUST match Supabase column names exactly  
- Do not introduce new field names without updating schema  
- All review writes must use this contract  
- No stringified JSON in the PATCH body  

---

## Notes

This contract is used by:
- Dify workflows  
- Human review branches  
- Future backend integrations
