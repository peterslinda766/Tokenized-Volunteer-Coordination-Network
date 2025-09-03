;; HoursLogger.clar
;; Contract for logging volunteer hours in the Tokenized Volunteer Coordination Network.
;; Volunteers log hours for assigned tasks in crisis events. Includes validation, integration with TaskManager for assignments,
;; and submission to VerificationContract for multisig approval. Ensures only valid, non-overlapping logs are submitted.

;; Constants
(define-constant ERR-UNAUTHORIZED u200) ;; Caller not authorized
(define-constant ERR-INVALID-TASK u201) ;; Invalid or non-existent task
(define-constant ERR-NOT-ASSIGNED u202) ;; Volunteer not assigned to task
(define-constant ERR-INVALID-HOURS u203) ;; Invalid hours (e.g., 0 or exceeds max)
(define-constant ERR-PAUSED u204) ;; Contract paused
(define-constant ERR-INTEGRATION-FAIL u205) ;; Failure calling external contract
(define-constant ERR-OVERLAPPING-LOG u206) ;; Overlapping time log detected
(define-constant ERR-EVENT-ENDED u207) ;; Event has ended
(define-constant ERR-INVALID-METADATA u208) ;; Invalid metadata
(define-constant ERR-NOT-OWNER u209) ;; Not contract owner
(define-constant ERR-LOG-EXISTS u210) ;; Log already exists for this period
(define-constant ERR-INVALID-PERIOD u211) ;; Invalid logging period
(define-constant ERR-MAX-LOGS-EXCEEDED u212) ;; Max logs per volunteer exceeded

(define-constant MAX_HOURS_PER_LOG u24) ;; Max hours per single log entry
(define-constant MAX_LOGS_PER_VOLUNTEER u50) ;; Max logs per volunteer per event
(define-constant METADATA_MAX_LEN u256) ;; Max bytes for metadata buff
(define-constant LOG_PERIOD_BLOCKS u144) ;; Logging period window (~1 day)

;; Data Variables
(define-data-var contract-owner principal tx-sender) ;; Initial owner
(define-data-var paused bool false) ;; Pause flag
(define-data-var total-logs uint u0) ;; Global log counter

;; Data Maps
(define-map logs
  { log-id: uint }
  {
    event-id: uint,
    task-id: uint,
    volunteer: principal,
    hours: uint,
    start-block: uint, ;; Block when work started
    end-block: uint,   ;; Block when work ended
    metadata: (optional (buff 256)), ;; Proof or notes
    status: (string-ascii 20) ;; "logged", "submitted", "verified", "rejected"
  }
)

(define-map volunteer-logs
  { volunteer: principal, event-id: uint }
  { log-ids: (list 50 uint) } ;; List of log IDs for the volunteer in the event
)

(define-map task-assignments
  { task-id: uint }
  { assignees: (list 50 principal) } ;; Cached assignments from TaskManager
)

;; Traits for integration
(use-trait task-manager-trait 
    'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.task-manager.task-manager-trait)

(use-trait verification-contract-trait
    'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.verification-contract.verification-contract-trait)

;; Private Functions
(define-private (is-valid-hours (hours uint))
    (and (> hours u0) (<= hours MAX_HOURS_PER_LOG))
)

(define-private (no-overlap (volunteer principal) (event-id uint) (start-block uint) (end-block uint))
  (let ((existing-logs (get log-ids (default-to {log-ids: (list )} (map-get? volunteer-logs {volunteer: volunteer, event-id: event-id})))))
    (fold (lambda (log-id acc) 
            (and acc 
                 (let ((log (unwrap-panic (map-get? logs {log-id: log-id}))))
                   (or (>= start-block (get end-block log)) (<= end-block (get start-block log))))))
          existing-logs 
          true)
  )
)

(define-private (submit-to-verification (log-id uint) (verification-contract principal))
  (let ((log (unwrap-panic (map-get? logs {log-id: log-id}))))
    (as-contract 
      (contract-call? 
        verification-contract
        submit-for-verification 
        (get event-id log) 
        (get task-id log) 
        (get volunteer log) 
        (get hours log) 
        (get metadata log)
      )
    )
  )
)

;; Private audit logging function
(define-private (log-audit (action (string-ascii 50)) (details (buff 512)))
  (let ((audit-id (+ (var-get total-logs) u1)))
    (map-set audit-logs 
      {audit-id: audit-id}
      {
        action: action,
        caller: tx-sender,
        timestamp: block-height,
        details: details
      }
    )
    true
  )
)

;; Public Functions
(define-public (log-hours (event-id uint) 
                         (task-id uint) 
                         (hours uint) 
                         (start-block uint) 
                         (end-block uint) 
                         (metadata (optional (buff 256))) 
                         (task-manager principal) 
                         (verification-contract principal))
  (let ((log-id (+ (var-get total-logs) u1))
        (assignment (map-get? task-assignments {task-id: task-id}))
        (task-details (contract-call? task-manager get-task-details task-id)))
    
    (asserts! (not (var-get paused)) (err ERR-PAUSED))
    (asserts! (is-ok task-details) (err ERR-INVALID-TASK))
    (asserts! (is-eq (get event-id (unwrap-panic task-details)) event-id) (err ERR-INVALID-TASK))
    (asserts! (is-none (get end-block (unwrap-panic task-details))) (err ERR-EVENT-ENDED))
    (asserts! (contract-call? task-manager is-assigned task-id tx-sender) (err ERR-NOT-ASSIGNED))
    (asserts! (is-valid-hours hours) (err ERR-INVALID-HOURS))
    (asserts! (and (> end-block start-block) (<= (- end-block start-block) LOG_PERIOD_BLOCKS)) (err ERR-INVALID-PERIOD))
    (asserts! (no-overlap tx-sender event-id start-block end-block) (err ERR-OVERLAPPING-LOG))
    (asserts! (match metadata some-meta (<= (len some-meta) METADATA_MAX_LEN) true) (err ERR-INVALID-METADATA))
    
    (let ((vol-logs (default-to {log-ids: (list )} (map-get? volunteer-logs {volunteer: tx-sender, event-id: event-id}))))
      (asserts! (< (len (get log-ids vol-logs)) MAX_LOGS_PER_VOLUNTEER) (err ERR-MAX-LOGS-EXCEEDED))
      (map-set volunteer-logs 
        {volunteer: tx-sender, event-id: event-id} 
        {log-ids: (append (get log-ids vol-logs) log-id)}
      )
    )
    
    (map-set logs 
      {log-id: log-id}
      {
        event-id: event-id,
        task-id: task-id,
        volunteer: tx-sender,
        hours: hours,
        start-block: start-block,
        end-block: end-block,
        metadata: metadata,
        status: "logged"
      }
    )
    
    (var-set total-logs log-id)
    
    (match (submit-to-verification log-id verification-contract)
      success (begin
                (map-set logs 
                  {log-id: log-id} 
                  (merge (unwrap-panic (map-get? logs {log-id: log-id})) 
                        {status: "submitted"})
                )
                (print {event: "hours-submitted", log-id: log-id})
                (ok log-id)
              )
      error (err ERR-INTEGRATION-FAIL)
    )
  )
)

(define-public (update-log-status (log-id uint) (new-status (string-ascii 20)))
  (let ((log (map-get? logs {log-id: log-id})))
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR-NOT-OWNER))
    (asserts! (is-some log) (err ERR-INVALID-TASK))
    (map-set logs {log-id: log-id} (merge (unwrap-panic log) {status: new-status}))
    (ok true)
  )
)

(define-public (pause-contract)
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR-NOT-OWNER))
    (var-set paused true)
    (ok true)
  )
)

(define-public (unpause-contract)
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR-NOT-OWNER))
    (var-set paused false)
    (ok true)
  )
)

(define-public (transfer-ownership (new-owner principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR-NOT-OWNER))
    (var-set contract-owner new-owner)
    (ok true)
  )
)

;; Read-Only Functions
(define-read-only (get-log-details (log-id uint))
  (map-get? logs {log-id: log-id})
)

(define-read-only (get-volunteer-logs (volunteer principal) (event-id uint))
  (get log-ids (map-get? volunteer-logs {volunteer: volunteer, event-id: event-id}))
)

(define-read-only (get-total-logs)
  (var-get total-logs)
)

(define-read-only (is-contract-paused)
  (var-get paused)
)

(define-read-only (get-contract-owner)
  (var-get contract-owner)
)

;; Audit logs map
(define-map audit-logs
  { audit-id: uint }
  {
    action: (string-ascii 50),
    caller: principal,
    timestamp: uint,
    details: (buff 512)
  }
)