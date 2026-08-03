import { useState, useEffect, useMemo, useRef } from "react";
import { Plus, Trash2, TrendingUp, TrendingDown, Wallet, X, PiggyBank, LogOut, Settings } from "lucide-react";
import {
  subscribeToBudgetData,
  saveBudgetData,
  fetchLegacyData,
  importLegacyDataForUser,
} from "./firebase.js";

const CATEGORY_NAME_PRESETS = ["Courses", "Logement", "Transport", "Loisirs", "Santé", "Autre"];

const DEFAULT_ACCOUNT_COLORS = ["#B0637A", "#5C7B8B", "#C9A857", "#5C8B6E", "#7A6C8E", "#8B7355"];

function getAccount(accounts, id) {
  return accounts.find((a) => a.id === id) || accounts[0] || { id: "", name: "?", color: "#8A7F9E" };
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function formatEUR(n) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(n);
}

export default function BudgetApp({ uid, userEmail, onSignOut }) {
  const [loaded, setLoaded] = useState(false);
  const [budgets, setBudgets] = useState([]); // {id, name, limit} (no color anymore)
  const [transactions, setTransactions] = useState([]); // {id, categoryId, accountId, amount, note, date, type}
  const [recurring, setRecurring] = useState([]); // {id, name, amount, type: 'income'|'accountId'}
  const [accountBudgets, setAccountBudgets] = useState({}); // { [accountId]: amount }
  const [accounts, setAccounts] = useState([]); // {id, name, color} — user-editable
  const [monthlyArchive, setMonthlyArchive] = useState([]); // [{id, label, closedAt, transactions, netResult}]
  const [savings, setSavings] = useState(0); // cumulative leftover from closed months
  const [showAddTx, setShowAddTx] = useState(false);
  const [showAddBudget, setShowAddBudget] = useState(false);
  const [showAddRecurring, setShowAddRecurring] = useState(false);
  const [showAccountsView, setShowAccountsView] = useState(false);
  const [showManageAccounts, setShowManageAccounts] = useState(false);
  const [showSavingsView, setShowSavingsView] = useState(false);
  const [showNewMonthConfirm, setShowNewMonthConfirm] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [pendingDeleteBudgetId, setPendingDeleteBudgetId] = useState(null);
  const [saveError, setSaveError] = useState(false);
  const [legacyAvailable, setLegacyAvailable] = useState(false);
  const [importingLegacy, setImportingLegacy] = useState(false);

  // isRemoteUpdate: true while we're applying data that just arrived from
  // Firebase, so the save effect below doesn't immediately write it right
  // back (which would be wasteful and could race with the other device).
  const isRemoteUpdate = useRef(false);

  // Subscribe to real-time updates from Firebase on mount.
  // Every time either phone changes something, both phones receive the
  // update automatically — no manual refresh needed.
  useEffect(() => {
    const unsubscribe = subscribeToBudgetData(uid, (data, error) => {
      if (error) {
        setSaveError(true);
        setLoaded(true);
        return;
      }
      if (data) {
        isRemoteUpdate.current = true;
        setBudgets(data.budgets || []);
        setTransactions(data.transactions || []);
        setRecurring(data.recurring || []);
        setAccountBudgets(data.accountBudgets || {});
        setAccounts(data.accounts || []);
        setMonthlyArchive(data.monthlyArchive || []);
        setSavings(data.savings || 0);
      } else {
        // First run ever for this account: seed with example categories
        // and default accounts. This is NOT a remote update — it must
        // actually be written to Firebase so every device on this account
        // starts from the same shared data.
        const seeded = CATEGORY_NAME_PRESETS.slice(0, 4).map((name) => ({
          id: genId(),
          name,
          limit: 300,
        }));
        setBudgets(seeded);
        setAccounts([
          { id: genId(), name: "Compte 1", color: DEFAULT_ACCOUNT_COLORS[0] },
          { id: genId(), name: "Compte 2", color: DEFAULT_ACCOUNT_COLORS[1] },
          { id: genId(), name: "Commun", color: DEFAULT_ACCOUNT_COLORS[2] },
        ]);
        // Check if there's old shared data (from before accounts existed)
        // that this person might want to import.
        fetchLegacyData()
          .then((legacy) => setLegacyAvailable(!!legacy))
          .catch(() => setLegacyAvailable(false));
      }
      setSaveError(false);
      setLoaded(true);
    });
    return () => unsubscribe();
  }, [uid]);

  // Persist to Firebase whenever data changes (after initial load),
  // unless this render was triggered by data arriving FROM Firebase.
  useEffect(() => {
    if (!loaded) return;
    if (isRemoteUpdate.current) {
      isRemoteUpdate.current = false;
      return;
    }
    saveBudgetData(uid, {
      budgets,
      transactions,
      recurring,
      accountBudgets,
      accounts,
      monthlyArchive,
      savings,
    }).catch(() => setSaveError(true));
  }, [budgets, transactions, recurring, accountBudgets, accounts, monthlyArchive, savings, loaded, uid]);

  async function importLegacyData() {
    if (importingLegacy) return;
    setImportingLegacy(true);
    try {
      const legacy = await fetchLegacyData();
      if (legacy) {
        // Ensure imported categories keep working with the account system:
        // if legacy data has no `accounts` list (old shared version never had
        // one), seed accounts using the EXACT same ids the old hardcoded
        // version used ("melo", "theo", "commun") — not random ids — so that
        // existing transactions/categories (which reference these ids) stay
        // correctly linked to their account after import.
        const dataToImport = {
          ...legacy,
          accounts:
            legacy.accounts && legacy.accounts.length > 0
              ? legacy.accounts
              : [
                  { id: "melo", name: "Mélo", color: DEFAULT_ACCOUNT_COLORS[0] },
                  { id: "theo", name: "Théo", color: DEFAULT_ACCOUNT_COLORS[1] },
                  { id: "commun", name: "Commun", color: DEFAULT_ACCOUNT_COLORS[2] },
                ],
        };
        await importLegacyDataForUser(uid, dataToImport);
        // The Firebase subscription above will pick up this change automatically.
      }
      setLegacyAvailable(false);
    } catch (e) {
      setSaveError(true);
    } finally {
      setImportingLegacy(false);
    }
  }

  const spentByCategory = useMemo(() => {
    const map = {};
    for (const b of budgets) map[b.id] = 0;
    for (const t of transactions) {
      if (t.type === "expense") {
        map[t.categoryId] = (map[t.categoryId] || 0) + t.amount;
      }
    }
    return map;
  }, [budgets, transactions]);

  const totals = useMemo(() => {
    let income = 0,
      expense = 0;
    for (const t of transactions) {
      if (t.type === "income") income += t.amount;
      else expense += t.amount;
    }
    return { income, expense, balance: income - expense };
  }, [transactions]);

  // Overspend per category: amount spent beyond its limit, if any
  const overspendByCategory = useMemo(() => {
    let total = 0;
    for (const b of budgets) {
      const spent = spentByCategory[b.id] || 0;
      if (spent > b.limit) total += spent - b.limit;
    }
    return total;
  }, [budgets, spentByCategory]);

  const plannedExpense = useMemo(() => {
    return budgets.reduce((sum, b) => sum + b.limit, 0);
  }, [budgets]);

  const fixedIncome = useMemo(() => {
    return recurring.filter((r) => r.type === "income").reduce((s, r) => s + r.amount, 0);
  }, [recurring]);

  // Projected end-of-month balance:
  // fixed income minus what's planned to be spent (category limits) minus any overspend already happening
  const projection = useMemo(() => {
    const projectedExpense = plannedExpense + overspendByCategory;
    return {
      fixedIncome,
      plannedExpense,
      overspend: overspendByCategory,
      projectedBalance: fixedIncome - projectedExpense,
    };
  }, [fixedIncome, plannedExpense, overspendByCategory]);

  const spentByAccount = useMemo(() => {
    const map = {};
    for (const a of accounts) map[a.id] = 0;
    for (const t of transactions) {
      if (t.type === "expense" && t.accountId) {
        map[t.accountId] = (map[t.accountId] || 0) + t.amount;
      }
    }
    return map;
  }, [transactions, accounts]);

  function setAccountBudget(accountId, amount) {
    setAccountBudgets((prev) => ({ ...prev, [accountId]: amount }));
  }

  function addAccount(name) {
    const color = DEFAULT_ACCOUNT_COLORS[accounts.length % DEFAULT_ACCOUNT_COLORS.length];
    setAccounts((a) => [...a, { id: genId(), name, color }]);
  }

  function renameAccount(id, newName) {
    setAccounts((a) => a.map((acc) => (acc.id === id ? { ...acc, name: newName } : acc)));
  }

  // Deleting an account reassigns everything that referenced it (transactions,
  // recurring income, category defaults) to a fallback account, instead of
  // deleting that data. This avoids surprise data loss. Refuses to delete
  // the last remaining account.
  function deleteAccount(id) {
    if (accounts.length <= 1) return;
    const fallback = accounts.find((a) => a.id !== id);
    if (!fallback) return;
    setTransactions((t) => t.map((x) => (x.accountId === id ? { ...x, accountId: fallback.id } : x)));
    setRecurring((r) => r.map((x) => (x.accountId === id ? { ...x, accountId: fallback.id } : x)));
    setBudgets((b) => b.map((x) => (x.defaultAccountId === id ? { ...x, defaultAccountId: fallback.id } : x)));
    setAccountBudgets((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setAccounts((a) => a.filter((acc) => acc.id !== id));
  }

  function addBudget(name, limit, defaultAccountId) {
    setBudgets((b) => [...b, { id: genId(), name, limit, defaultAccountId }]);
  }

  function deleteBudget(id) {
    setBudgets((b) => b.filter((x) => x.id !== id));
    setTransactions((t) => t.filter((x) => x.categoryId !== id));
  }

  function addTransaction(tx) {
    setTransactions((t) => [{ id: genId(), date: new Date().toISOString(), ...tx }, ...t]);
  }

  function deleteTransaction(id) {
    setTransactions((t) => t.filter((x) => x.id !== id));
  }

  function addRecurring(name, amount, accountId) {
    setRecurring((r) => [...r, { id: genId(), name, amount, type: "income", accountId }]);
  }

  function deleteRecurring(id) {
    setRecurring((r) => r.filter((x) => x.id !== id));
  }

  // Move budget allocation between two categories: decreases the source
  // category's limit and increases the target category's by the same amount.
  // No transaction is created — this only reallocates planned budget, not spending.
  function transferBetweenCategories(fromCategoryId, toCategoryId, amount) {
    setBudgets((prev) =>
      prev.map((b) => {
        if (b.id === fromCategoryId) return { ...b, limit: b.limit - amount };
        if (b.id === toCategoryId) return { ...b, limit: b.limit + amount };
        return b;
      })
    );
  }

  // Close the current month: archive its transactions, compute the real net
  // result (fixed income + logged income - logged expenses), add it to savings,
  // and clear transactions for a fresh month. Category limits and account
  // budgets are left untouched since they represent recurring habits.
  function closeMonth() {
    const netResult = fixedIncome + totals.income - totals.expense;
    const archiveEntry = {
      id: genId(),
      label: new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
      closedAt: new Date().toISOString(),
      transactions,
      netResult,
    };
    setMonthlyArchive((a) => [archiveEntry, ...a]);
    setSavings((s) => s + netResult);
    setTransactions([]);
  }


  if (!loaded) {
    return (
      <div style={styles.loadingScreen}>
        <div style={styles.loadingPulse}>Chargement du budget…</div>
      </div>
    );
  }

  return (
    <div style={styles.app}>
      <style>{fontImports}</style>
      <header style={styles.header}>
        <div style={styles.headerTop}>
          <div style={styles.headerTopLeft}>
            <Wallet size={20} color="#E8DFC8" strokeWidth={1.75} />
            <span style={styles.headerLabel}>Notre budget</span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              style={styles.iconBtnSmall}
              onClick={() => setShowManageAccounts(true)}
              aria-label="Gérer les comptes"
            >
              <Settings size={14} color="#E8DFC8" />
            </button>
            <button style={styles.iconBtnSmall} onClick={onSignOut} aria-label="Se déconnecter">
              <LogOut size={14} color="#E8DFC8" />
            </button>
          </div>
        </div>
        <div style={styles.headerTop}>
          <button style={styles.accountsBtn} onClick={() => setShowAccountsView(true)}>
            Vue par compte
          </button>
        </div>
        <div style={styles.balanceRow}>
          <span
            style={{
              ...styles.balanceNumber,
              color: totals.balance >= 0 ? "#8FBF9F" : "#E08E7D",
            }}
          >
            {formatEUR(totals.balance)}
          </span>
        </div>
        <div style={styles.subRow}>
          <span style={styles.subStat}>
            <TrendingUp size={13} color="#8FBF9F" style={{ verticalAlign: "-2px", marginRight: 4 }} />
            {formatEUR(totals.income)}
          </span>
          <span style={styles.subStat}>
            <TrendingDown size={13} color="#E08E7D" style={{ verticalAlign: "-2px", marginRight: 4 }} />
            {formatEUR(totals.expense)}
          </span>
        </div>
        <div style={styles.headerActionsRow}>
          <button style={styles.headerActionBtn} onClick={() => setShowSavingsView(true)}>
            <PiggyBank size={14} color="#E8DFC8" style={{ marginRight: 5, verticalAlign: "-2px" }} />
            Épargne · {formatEUR(savings)}
          </button>
          <button style={styles.headerActionBtn} onClick={() => setShowNewMonthConfirm(true)}>
            Nouveau mois
          </button>
        </div>
      </header>

      {legacyAvailable && (
        <div style={styles.legacyBanner}>
          <span>D'anciennes données partagées ont été trouvées.</span>
          <button style={styles.legacyImportBtn} onClick={importLegacyData} disabled={importingLegacy}>
            {importingLegacy ? "Import…" : "Importer"}
          </button>
          <button
            style={styles.legacyDismissBtn}
            onClick={() => setLegacyAvailable(false)}
            aria-label="Ignorer"
          >
            <X size={14} color="#A79FBB" />
          </button>
        </div>
      )}

      <main style={styles.main}>
        <div style={styles.sectionHeadRow}>
          <h2 style={styles.sectionHead}>Prévisionnel du mois</h2>
          <button
            style={styles.iconBtnSmall}
            onClick={() => setShowAddRecurring(true)}
            aria-label="Ajouter un revenu fixe"
          >
            <Plus size={16} color="#E8DFC8" />
          </button>
        </div>

        <div style={styles.forecastCard}>
          <div style={styles.forecastMain}>
            <span style={styles.forecastLabel}>Solde projeté en fin de mois</span>
            <span
              style={{
                ...styles.forecastNumber,
                color: projection.projectedBalance >= 0 ? "#8FBF9F" : "#E08E7D",
              }}
            >
              {formatEUR(projection.projectedBalance)}
            </span>
          </div>

          <div style={styles.forecastBreakdown}>
            <div style={styles.forecastLine}>
              <span style={styles.forecastLineLabel}>Revenus fixes</span>
              <span style={{ ...styles.forecastLineValue, color: "#8FBF9F" }}>
                +{formatEUR(projection.fixedIncome)}
              </span>
            </div>
            <div style={styles.forecastLine}>
              <span style={styles.forecastLineLabel}>Dépenses prévues (budgets)</span>
              <span style={{ ...styles.forecastLineValue, color: "#E8DFC8" }}>
                −{formatEUR(projection.plannedExpense)}
              </span>
            </div>
            {projection.overspend > 0 && (
              <div style={styles.forecastLine}>
                <span style={{ ...styles.forecastLineLabel, color: "#E08E7D" }}>Dépassements constatés</span>
                <span style={{ ...styles.forecastLineValue, color: "#E08E7D" }}>
                  −{formatEUR(projection.overspend)}
                </span>
              </div>
            )}
          </div>

          {recurring.length === 0 ? (
            <p style={styles.emptyText}>
              Ajoutez vos revenus fixes (salaires…) pour projeter votre solde de fin de mois.
            </p>
          ) : (
            <div style={styles.recurringList}>
              {recurring.map((r) => {
                const account = r.accountId ? getAccount(accounts, r.accountId) : null;
                return (
                  <div key={r.id} style={styles.recurringRow}>
                    <span style={{ ...styles.txDot, background: account?.color || "#5C8B6E" }} />
                    <span style={styles.recurringName}>
                      {r.name}
                      {account ? ` · ${account.name}` : ""}
                    </span>
                    <span style={{ ...styles.txAmount, color: "#8FBF9F" }}>+{formatEUR(r.amount)}</span>
                    <button
                      style={styles.txDelete}
                      onClick={() => deleteRecurring(r.id)}
                      aria-label={`Supprimer ${r.name}`}
                    >
                      <X size={14} color="#6B6480" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={styles.sectionHeadRow}>
          <h2 style={styles.sectionHead}>Catégories</h2>
          <button style={styles.iconBtnSmall} onClick={() => setShowAddBudget(true)} aria-label="Ajouter une catégorie">
            <Plus size={16} color="#E8DFC8" />
          </button>
        </div>

        {budgets.length === 0 && (
          <p style={styles.emptyText}>Aucune catégorie. Ajoutez-en une pour commencer à suivre vos dépenses.</p>
        )}

        <div style={styles.budgetList}>
          {budgets.map((b) => {
            const spent = spentByCategory[b.id] || 0;
            const pct = b.limit > 0 ? Math.min(spent / b.limit, 1) : 0;
            const over = spent > b.limit;
            const remaining = b.limit - spent;
            return (
              <div
                key={b.id}
                style={{ ...styles.budgetCard, cursor: "pointer" }}
                onClick={() => setSelectedCategoryId(b.id)}
              >
                <div style={styles.budgetTopRow}>
                  <span style={styles.budgetName}>{b.name}</span>
                  <button
                    style={styles.deleteBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDeleteBudgetId(b.id);
                    }}
                    aria-label={`Supprimer ${b.name}`}
                  >
                    <Trash2 size={14} color="#8A7F9E" />
                  </button>
                </div>
                <div style={styles.barTrack}>
                  <div
                    style={{
                      ...styles.barFill,
                      width: `${pct * 100}%`,
                      background: over ? "#D96C5C" : "#5C6E8A",
                      borderRadius: pct > 0.97 ? "999px" : "999px 4px 4px 999px",
                    }}
                  />
                  <span style={styles.barLabel}>
                    {over
                      ? `Dépassé de ${formatEUR(Math.abs(remaining))}`
                      : `Reste ${formatEUR(remaining)}`}
                  </span>
                </div>
                <div style={styles.budgetMeta}>
                  {formatEUR(spent)} / {formatEUR(b.limit)}
                </div>
              </div>
            );
          })}
        </div>

        <div style={styles.sectionHeadRow}>
          <h2 style={styles.sectionHead}>Transactions récentes</h2>
        </div>
        <div style={styles.txList}>
          {transactions.length === 0 && (
            <p style={styles.emptyText}>Rien pour l'instant. Ajoutez votre première transaction.</p>
          )}
          {transactions.slice(0, 25).map((t) => {
            const cat = budgets.find((b) => b.id === t.categoryId);
            const account = t.accountId ? getAccount(accounts, t.accountId) : null;
            return (
              <div key={t.id} style={styles.txRow}>
                <div
                  style={{
                    ...styles.txDot,
                    background: t.type === "income" ? "#5C8B6E" : account?.color || "#8A7F9E",
                  }}
                />
                <div style={styles.txInfo}>
                  <span style={styles.txNote}>{t.note || (t.type === "income" ? "Revenu" : cat?.name || "Dépense")}</span>
                  <span style={styles.txDate}>
                    {new Date(t.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                    {account ? ` · ${account.name}` : ""}
                  </span>
                </div>
                <span
                  style={{
                    ...styles.txAmount,
                    color: t.type === "income" || t.amount < 0 ? "#8FBF9F" : "#E8DFC8",
                  }}
                >
                  {t.type === "income" || t.amount < 0 ? "+" : "−"}
                  {formatEUR(Math.abs(t.amount))}
                </span>
                <button style={styles.txDelete} onClick={() => deleteTransaction(t.id)} aria-label="Supprimer">
                  <X size={14} color="#6B6480" />
                </button>
              </div>
            );
          })}
        </div>
      </main>

      <button style={styles.fab} onClick={() => setShowAddTx(true)} aria-label="Ajouter une transaction">
        <Plus size={24} color="#1C2333" strokeWidth={2.5} />
      </button>

      {saveError && (
        <div style={styles.errorBanner}>
          Connexion au serveur impossible. Vérifiez votre connexion internet.
        </div>
      )}

      {selectedCategoryId && (
        <CategoryDetailModal
          category={budgets.find((b) => b.id === selectedCategoryId)}
          budgets={budgets}
          accounts={accounts}
          transactions={transactions}
          onClose={() => setSelectedCategoryId(null)}
          onTransfer={transferBetweenCategories}
        />
      )}

      {pendingDeleteBudgetId && (
        <ConfirmDeleteModal
          category={budgets.find((b) => b.id === pendingDeleteBudgetId)}
          transactionCount={transactions.filter((t) => t.categoryId === pendingDeleteBudgetId).length}
          onClose={() => setPendingDeleteBudgetId(null)}
          onConfirm={() => {
            deleteBudget(pendingDeleteBudgetId);
            setPendingDeleteBudgetId(null);
          }}
        />
      )}

      {showManageAccounts && (
        <ManageAccountsModal
          accounts={accounts}
          userEmail={userEmail}
          onClose={() => setShowManageAccounts(false)}
          onAdd={addAccount}
          onRename={renameAccount}
          onDelete={deleteAccount}
        />
      )}

      {showNewMonthConfirm && (
        <NewMonthConfirmModal
          netResult={fixedIncome + totals.income - totals.expense}
          transactionCount={transactions.length}
          onClose={() => setShowNewMonthConfirm(false)}
          onConfirm={() => {
            closeMonth();
            setShowNewMonthConfirm(false);
          }}
        />
      )}

      {showSavingsView && (
        <SavingsViewModal
          savings={savings}
          monthlyArchive={monthlyArchive}
          onClose={() => setShowSavingsView(false)}
        />
      )}

      {showAddTx && (
        <AddTransactionModal
          key={budgets.length + "-" + budgets.map((b) => b.defaultAccountId).join(",") + "-" + accounts.length}
          budgets={budgets}
          accounts={accounts}
          onClose={() => setShowAddTx(false)}
          onAdd={(tx) => {
            addTransaction(tx);
            setShowAddTx(false);
          }}
        />
      )}

      {showAddBudget && (
        <AddBudgetModal
          accounts={accounts}
          onClose={() => setShowAddBudget(false)}
          onAdd={(name, limit, defaultAccountId) => {
            addBudget(name, limit, defaultAccountId);
            setShowAddBudget(false);
          }}
        />
      )}

      {showAddRecurring && (
        <AddRecurringModal
          accounts={accounts}
          onClose={() => setShowAddRecurring(false)}
          onAdd={(name, amount, accountId) => {
            addRecurring(name, amount, accountId);
            setShowAddRecurring(false);
          }}
        />
      )}
      {showAccountsView && (
        <AccountsViewModal
          key={budgets.length + "-" + budgets.map((b) => b.defaultAccountId).join(",") + "-" + accounts.length}
          accounts={accounts}
          spentByAccount={spentByAccount}
          accountBudgets={accountBudgets}
          recurring={recurring}
          budgets={budgets}
          spentByCategory={spentByCategory}
          onSetBudget={setAccountBudget}
          onClose={() => setShowAccountsView(false)}
        />
      )}
    </div>
  );
}

function ConfirmDeleteModal({ category, transactionCount, onClose, onConfirm }) {
  if (!category) return null;
  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHandle} />
        <h3 style={styles.modalTitle}>Supprimer « {category.name} » ?</h3>
        <p style={styles.emptyText}>
          {transactionCount > 0
            ? `Cette catégorie et ses ${transactionCount} transaction${transactionCount > 1 ? "s" : ""} associée${transactionCount > 1 ? "s" : ""} seront supprimées définitivement.`
            : "Cette catégorie sera supprimée définitivement."}
        </p>
        <div style={styles.modalActions}>
          <button style={styles.cancelBtn} onClick={onClose}>
            Annuler
          </button>
          <button style={styles.deleteConfirmBtn} onClick={onConfirm}>
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}

function ManageAccountsModal({ accounts, userEmail, onClose, onAdd, onRename, onDelete }) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  function submitAdd() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setNewName("");
  }

  function startEdit(account) {
    setEditingId(account.id);
    setEditValue(account.name);
  }

  function saveEdit(id) {
    const trimmed = editValue.trim();
    if (trimmed) onRename(id, trimmed);
    setEditingId(null);
  }

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHandle} />
        <h3 style={styles.modalTitle}>Gérer les comptes</h3>
        {userEmail && <p style={styles.emptyText}>Connecté en tant que {userEmail}</p>}

        <div style={styles.accountsViewList}>
          {accounts.map((a) => (
            <div key={a.id} style={styles.accountCard}>
              {editingId === a.id ? (
                <div style={styles.editBudgetRow}>
                  <input
                    style={styles.input}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    autoFocus
                  />
                  <button style={styles.confirmBtnSmall} onClick={() => saveEdit(a.id)}>
                    OK
                  </button>
                </div>
              ) : confirmDeleteId === a.id ? (
                <>
                  <p style={styles.emptyText}>
                    Supprimer « {a.name} » ? Les dépenses et revenus qui lui sont rattachés seront
                    réaffectés à « {accounts.find((x) => x.id !== a.id)?.name} ».
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={styles.cancelBtn} onClick={() => setConfirmDeleteId(null)}>
                      Annuler
                    </button>
                    <button
                      style={styles.deleteConfirmBtn}
                      onClick={() => {
                        onDelete(a.id);
                        setConfirmDeleteId(null);
                      }}
                    >
                      Supprimer
                    </button>
                  </div>
                </>
              ) : (
                <div style={styles.budgetTopRow}>
                  <span style={styles.accountCardName}>
                    <span style={{ ...styles.accountChipDot, background: a.color }} />
                    {a.name}
                  </span>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button style={styles.editBudgetBtn} onClick={() => startEdit(a)}>
                      Renommer
                    </button>
                    {accounts.length > 1 && (
                      <button
                        style={{ ...styles.editBudgetBtn, color: "#E08E7D" }}
                        onClick={() => setConfirmDeleteId(a.id)}
                      >
                        Supprimer
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <label style={styles.fieldLabel}>Ajouter un compte</label>
        <div style={styles.editBudgetRow}>
          <input
            style={styles.input}
            placeholder="Ex : Papa"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button style={styles.confirmBtnSmall} onClick={submitAdd}>
            Ajouter
          </button>
        </div>

        <div style={styles.modalActions}>
          <button style={styles.confirmBtn} onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

function NewMonthConfirmModal({ netResult, transactionCount, onClose, onConfirm }) {
  const [confirming, setConfirming] = useState(false);

  function handleConfirm() {
    if (confirming) return;
    setConfirming(true);
    onConfirm();
  }

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHandle} />
        <h3 style={styles.modalTitle}>Passer au mois suivant ?</h3>

        <p style={styles.emptyText}>
          {transactionCount} transaction{transactionCount > 1 ? "s" : ""} de ce mois-ci seront archivées et
          l'historique de transactions repartira à zéro. Les limites de catégories et les budgets par compte
          restent inchangés.
        </p>

        <div style={styles.transferPreview}>
          Solde réel de ce mois : <br />
          <span style={{ color: netResult >= 0 ? "#8FBF9F" : "#E08E7D", fontWeight: 700, fontSize: 16 }}>
            {netResult >= 0 ? "+" : ""}
            {formatEUR(netResult)}
          </span>
          <br />
          Ce montant sera ajouté à votre épargne.
        </div>

        <div style={styles.modalActions}>
          <button style={styles.cancelBtn} onClick={onClose}>
            Annuler
          </button>
          <button
            style={{
              ...styles.confirmBtn,
              ...(confirming ? styles.confirmBtnDisabled : {}),
            }}
            onClick={handleConfirm}
            disabled={confirming}
          >
            Confirmer
          </button>
        </div>
      </div>
    </div>
  );
}

function SavingsViewModal({ savings, monthlyArchive, onClose }) {
  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHandle} />
        <h3 style={styles.modalTitle}>Épargne</h3>

        <div style={styles.forecastMain}>
          <span style={styles.forecastLabel}>Total accumulé</span>
          <span
            style={{
              ...styles.forecastNumber,
              color: savings >= 0 ? "#8FBF9F" : "#E08E7D",
            }}
          >
            {formatEUR(savings)}
          </span>
        </div>

        <label style={styles.fieldLabel}>Historique des mois clôturés</label>
        {monthlyArchive.length === 0 ? (
          <p style={styles.emptyText}>
            Aucun mois clôturé pour l'instant. Utilisez "Nouveau mois" pour archiver le mois en cours.
          </p>
        ) : (
          <div style={styles.recurringList}>
            {monthlyArchive.map((entry) => (
              <div key={entry.id} style={styles.recurringRow}>
                <span
                  style={{
                    ...styles.txDot,
                    background: entry.netResult >= 0 ? "#5C8B6E" : "#D96C5C",
                  }}
                />
                <span style={styles.recurringName}>
                  {entry.label.charAt(0).toUpperCase() + entry.label.slice(1)} · {entry.transactions.length} transaction
                  {entry.transactions.length > 1 ? "s" : ""}
                </span>
                <span
                  style={{
                    ...styles.txAmount,
                    color: entry.netResult >= 0 ? "#8FBF9F" : "#E08E7D",
                  }}
                >
                  {entry.netResult >= 0 ? "+" : ""}
                  {formatEUR(entry.netResult)}
                </span>
              </div>
            ))}
          </div>
        )}

        <div style={styles.modalActions}>
          <button style={styles.confirmBtn} onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

function AccountsViewModal({
  accounts,
  spentByAccount,
  accountBudgets,
  recurring,
  budgets,
  spentByCategory,
  onClose,
  onSetBudget,
}) {
  const [editingId, setEditingId] = useState(null);
  const [draftValue, setDraftValue] = useState("");

  function startEdit(account) {
    setEditingId(account.id);
    setDraftValue(accountBudgets[account.id] != null ? String(accountBudgets[account.id]) : "");
  }

  function saveEdit(accountId) {
    const value = parseFloat(draftValue.replace(",", "."));
    onSetBudget(accountId, isNaN(value) || value < 0 ? 0 : value);
    setEditingId(null);
  }

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHandle} />
        <h3 style={styles.modalTitle}>Vue par compte</h3>

        <div style={styles.accountsViewList}>
          {accounts.map((a) => {
            const spent = spentByAccount[a.id] || 0;
            const planned = accountBudgets[a.id] || 0;
            const remaining = planned - spent;
            const pct = planned > 0 ? Math.min(spent / planned, 1) : 0;
            const over = spent > planned && planned > 0;
            const isEditing = editingId === a.id;
            const income = recurring
              .filter((r) => r.accountId === a.id)
              .reduce((s, r) => s + r.amount, 0);

            return (
              <div key={a.id} style={styles.accountCard}>
                <div style={styles.budgetTopRow}>
                  <span style={styles.accountCardName}>
                    <span style={{ ...styles.accountChipDot, background: a.color }} />
                    {a.name}
                  </span>
                  {!isEditing && (
                    <button style={styles.editBudgetBtn} onClick={() => startEdit(a)}>
                      {planned > 0 ? "Modifier" : "Définir"}
                    </button>
                  )}
                </div>

                {income > 0 && (
                  <div style={styles.accountIncomeLine}>
                    Revenu fixe : <span style={{ color: "#8FBF9F", fontWeight: 600 }}>+{formatEUR(income)}</span>
                  </div>
                )}

                {isEditing ? (
                  <div style={styles.editBudgetRow}>
                    <input
                      style={styles.input}
                      inputMode="decimal"
                      placeholder="Budget prévu (€)"
                      value={draftValue}
                      onChange={(e) => setDraftValue(e.target.value)}
                      autoFocus
                    />
                    <button style={styles.confirmBtnSmall} onClick={() => saveEdit(a.id)}>
                      OK
                    </button>
                  </div>
                ) : planned > 0 ? (
                  <>
                    <div style={styles.barTrack}>
                      <div
                        style={{
                          ...styles.barFill,
                          width: `${pct * 100}%`,
                          background: over ? "#D96C5C" : a.color,
                          borderRadius: pct > 0.97 ? "999px" : "999px 4px 4px 999px",
                        }}
                      />
                      <span style={styles.barLabel}>
                        {over
                          ? `Dépassé de ${formatEUR(Math.abs(remaining))}`
                          : `Reste à venir ${formatEUR(remaining)}`}
                      </span>
                    </div>
                    <div style={styles.budgetMeta}>
                      {formatEUR(spent)} / {formatEUR(planned)}
                    </div>
                  </>
                ) : (
                  <p style={styles.emptyText}>Aucun budget prévisionnel défini pour ce compte.</p>
                )}

                {(() => {
                  const catsForAccount = budgets.filter((b) => b.defaultAccountId === a.id);
                  if (catsForAccount.length === 0) return null;
                  return (
                    <div style={styles.accountCatList}>
                      {catsForAccount.map((cat) => {
                        const catSpent = spentByCategory[cat.id] || 0;
                        const catOver = catSpent > cat.limit;
                        return (
                          <div key={cat.id} style={styles.accountCatRow}>
                            <span style={styles.accountCatName}>{cat.name}</span>
                            <span
                              style={{
                                ...styles.accountCatValue,
                                color: catOver ? "#E08E7D" : "#A79FBB",
                              }}
                            >
                              {formatEUR(catSpent)} / {formatEUR(cat.limit)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>

        <div style={styles.modalActions}>
          <button style={styles.confirmBtn} onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

function CategoryDetailModal({ category, budgets, accounts, transactions, onClose, onTransfer }) {
  const [showTransfer, setShowTransfer] = useState(false);

  if (!category) return null;

  const catTransactions = transactions.filter((t) => t.categoryId === category.id);
  const spent = catTransactions
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + t.amount, 0);
  const remaining = category.limit - spent;
  const over = spent > category.limit;

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHandle} />
        <h3 style={styles.modalTitle}>{category.name}</h3>

        <div style={styles.barTrack}>
          <div
            style={{
              ...styles.barFill,
              width: `${category.limit > 0 ? Math.min(spent / category.limit, 1) * 100 : 0}%`,
              background: over ? "#D96C5C" : "#5C6E8A",
              borderRadius: "999px",
            }}
          />
          <span style={styles.barLabel}>
            {over ? `Dépassé de ${formatEUR(Math.abs(remaining))}` : `Reste ${formatEUR(remaining)}`}
          </span>
        </div>
        <div style={styles.budgetMeta}>
          {formatEUR(spent)} / {formatEUR(category.limit)}
        </div>

        <button style={styles.transferBtn} onClick={() => setShowTransfer(true)}>
          Transférer des fonds vers une autre catégorie
        </button>

        <label style={styles.fieldLabel}>Transactions de cette catégorie</label>
        <div style={styles.txList}>
          {catTransactions.length === 0 && (
            <p style={styles.emptyText}>Aucune transaction pour cette catégorie.</p>
          )}
          {catTransactions.map((t) => {
            const account = t.accountId ? getAccount(accounts, t.accountId) : null;
            const isNegativeCorrection = t.amount < 0;
            return (
              <div key={t.id} style={styles.txRow}>
                <div
                  style={{
                    ...styles.txDot,
                    background: account?.color || "#8A7F9E",
                  }}
                />
                <div style={styles.txInfo}>
                  <span style={styles.txNote}>{t.note || "Dépense"}</span>
                  <span style={styles.txDate}>
                    {new Date(t.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                    {account ? ` · ${account.name}` : ""}
                  </span>
                </div>
                <span
                  style={{
                    ...styles.txAmount,
                    color: isNegativeCorrection ? "#8FBF9F" : "#E8DFC8",
                  }}
                >
                  {isNegativeCorrection ? "+" : "−"}
                  {formatEUR(Math.abs(t.amount))}
                </span>
              </div>
            );
          })}
        </div>

        <div style={styles.modalActions}>
          <button style={styles.confirmBtn} onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>

      {showTransfer && (
        <TransferModal
          fromCategory={category}
          budgets={budgets}
          onClose={() => setShowTransfer(false)}
          onConfirm={(toCategoryId, amount) => {
            onTransfer(category.id, toCategoryId, amount);
            setShowTransfer(false);
            onClose();
          }}
        />
      )}
    </div>
  );
}

function TransferModal({ fromCategory, budgets, onClose, onConfirm }) {
  const otherCategories = budgets.filter((b) => b.id !== fromCategory.id);
  const [toCategoryId, setToCategoryId] = useState(otherCategories[0]?.id || "");
  const [amount, setAmount] = useState("");

  const toCategory = otherCategories.find((b) => b.id === toCategoryId);
  const parsedAmount = parseFloat(amount.replace(",", "."));
  const exceedsSource = !isNaN(parsedAmount) && parsedAmount > fromCategory.limit;
  const validAmount = !isNaN(parsedAmount) && parsedAmount > 0 && !exceedsSource;

  function submit() {
    if (!validAmount || !toCategoryId) return;
    onConfirm(toCategoryId, parsedAmount);
  }

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHandle} />
        <h3 style={styles.modalTitle}>Transférer depuis « {fromCategory.name} »</h3>
        <p style={styles.emptyText}>
          Déplace une partie du budget prévu de « {fromCategory.name} » (limite actuelle {formatEUR(fromCategory.limit)}) vers une autre catégorie. Les dépenses déjà enregistrées ne bougent pas.
        </p>

        <label style={styles.fieldLabel}>Montant à transférer</label>
        <input
          style={styles.input}
          inputMode="decimal"
          placeholder="0,00 €"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoFocus
        />
        {exceedsSource && (
          <p style={styles.transferError}>
            Le montant dépasse la limite actuelle de « {fromCategory.name} » ({formatEUR(fromCategory.limit)}).
          </p>
        )}

        <label style={styles.fieldLabel}>Vers la catégorie</label>
        {otherCategories.length === 0 ? (
          <p style={styles.emptyText}>
            Aucune autre catégorie disponible. Créez-en une autre d'abord pour pouvoir transférer des fonds.
          </p>
        ) : (
          <div style={styles.catPicker}>
            {otherCategories.map((b) => (
              <button
                key={b.id}
                onClick={() => setToCategoryId(b.id)}
                style={{
                  ...styles.catChip,
                  borderColor: toCategoryId === b.id ? "#8FA3C4" : "transparent",
                  background: toCategoryId === b.id ? "#8FA3C433" : "#1C2333",
                }}
              >
                {b.name}
              </button>
            ))}
          </div>
        )}

        {toCategory && validAmount && (
          <p style={styles.transferPreview}>
            {fromCategory.name} : {formatEUR(fromCategory.limit)} → {formatEUR(fromCategory.limit - parsedAmount)}
            <br />
            {toCategory.name} : {formatEUR(toCategory.limit)} → {formatEUR(toCategory.limit + parsedAmount)}
          </p>
        )}

        <div style={styles.modalActions}>
          <button style={styles.cancelBtn} onClick={onClose}>
            Annuler
          </button>
          <button
            style={{
              ...styles.confirmBtn,
              ...(otherCategories.length === 0 || !validAmount || !toCategoryId ? styles.confirmBtnDisabled : {}),
            }}
            onClick={submit}
            disabled={otherCategories.length === 0 || !validAmount || !toCategoryId}
          >
            Transférer
          </button>
        </div>
      </div>
    </div>
  );
}

function AddRecurringModal({ accounts, onClose, onAdd }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id || "");

  function submit() {
    const value = parseFloat(amount.replace(",", "."));
    if (!name.trim() || !value || value <= 0 || !accountId) return;
    onAdd(name.trim(), value, accountId);
  }

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHandle} />
        <h3 style={styles.modalTitle}>Revenu fixe</h3>

        <label style={styles.fieldLabel}>Nom</label>
        <input
          style={styles.input}
          placeholder="Ex : Salaire"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />

        <label style={styles.fieldLabel}>Montant mensuel</label>
        <input
          style={styles.input}
          inputMode="decimal"
          placeholder="0,00 €"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />

        <label style={styles.fieldLabel}>Compte</label>
        <div style={styles.accountPicker}>
          {accounts.map((a) => (
            <button
              key={a.id}
              onClick={() => setAccountId(a.id)}
              style={{
                ...styles.accountChip,
                borderColor: accountId === a.id ? a.color : "transparent",
                background: accountId === a.id ? `${a.color}33` : "#1C2333",
              }}
            >
              <span style={{ ...styles.accountChipDot, background: a.color }} />
              {a.name}
            </button>
          ))}
        </div>

        <div style={styles.modalActions}>
          <button style={styles.cancelBtn} onClick={onClose}>
            Annuler
          </button>
          <button style={styles.confirmBtn} onClick={submit}>
            Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}

function AddTransactionModal({ budgets, accounts, onClose, onAdd }) {
  const [type, setType] = useState("expense");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState(budgets[0]?.id || "");
  const [accountId, setAccountId] = useState(budgets[0]?.defaultAccountId || accounts[0]?.id || "");
  const [note, setNote] = useState("");

  function selectCategory(id) {
    setCategoryId(id);
    const cat = budgets.find((b) => b.id === id);
    if (cat?.defaultAccountId) setAccountId(cat.defaultAccountId);
  }

  function submit() {
    const value = parseFloat(amount.replace(",", "."));
    if (!value || value <= 0) return;
    if (type === "expense" && (!categoryId || !accountId)) return;
    onAdd({
      type,
      amount: value,
      categoryId: type === "expense" ? categoryId : null,
      accountId: type === "expense" ? accountId : null,
      note: note.trim(),
    });
  }

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHandle} />
        <h3 style={styles.modalTitle}>Nouvelle transaction</h3>

        <div style={styles.typeToggle}>
          <button
            style={{
              ...styles.typeBtn,
              ...(type === "expense" ? styles.typeBtnActiveExpense : {}),
            }}
            onClick={() => setType("expense")}
          >
            Dépense
          </button>
          <button
            style={{
              ...styles.typeBtn,
              ...(type === "income" ? styles.typeBtnActiveIncome : {}),
            }}
            onClick={() => setType("income")}
          >
            Revenu
          </button>
        </div>

        <label style={styles.fieldLabel}>Montant</label>
        <input
          style={styles.input}
          inputMode="decimal"
          placeholder="0,00 €"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoFocus
        />

        {type === "expense" && (
          <>
            <label style={styles.fieldLabel}>Catégorie</label>
            {budgets.length === 0 ? (
              <p style={styles.emptyText}>
                Aucune catégorie créée. Fermez ce formulaire et créez d'abord une catégorie.
              </p>
            ) : (
              <div style={styles.catPicker}>
                {budgets.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => selectCategory(b.id)}
                    style={{
                      ...styles.catChip,
                      borderColor: categoryId === b.id ? "#8FA3C4" : "transparent",
                      background: categoryId === b.id ? "#8FA3C433" : "#1C2333",
                    }}
                  >
                    {b.name}
                  </button>
                ))}
              </div>
            )}

            <label style={styles.fieldLabel}>Compte</label>
            {accounts.length === 0 ? (
              <p style={styles.emptyText}>Aucun compte créé.</p>
            ) : (
              <div style={styles.accountPicker}>
                {accounts.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setAccountId(a.id)}
                    style={{
                      ...styles.accountChip,
                      borderColor: accountId === a.id ? a.color : "transparent",
                      background: accountId === a.id ? `${a.color}33` : "#1C2333",
                    }}
                  >
                    <span style={{ ...styles.accountChipDot, background: a.color }} />
                    {a.name}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        <label style={styles.fieldLabel}>Note (optionnel)</label>
        <input
          style={styles.input}
          placeholder="Ex : courses au marché"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        <div style={styles.modalActions}>
          <button style={styles.cancelBtn} onClick={onClose}>
            Annuler
          </button>
          <button style={styles.confirmBtn} onClick={submit}>
            Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}

function AddBudgetModal({ accounts, onClose, onAdd }) {
  const [name, setName] = useState("");
  const [limit, setLimit] = useState("");
  const [defaultAccountId, setDefaultAccountId] = useState(accounts[0]?.id || "");

  function submit() {
    const value = parseFloat(limit.replace(",", "."));
    if (!name.trim() || !value || value <= 0) return;
    onAdd(name.trim(), value, defaultAccountId);
  }

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHandle} />
        <h3 style={styles.modalTitle}>Nouvelle catégorie</h3>

        <label style={styles.fieldLabel}>Nom</label>
        <input
          style={styles.input}
          placeholder="Ex : Vacances"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />

        <label style={styles.fieldLabel}>Limite mensuelle</label>
        <input
          style={styles.input}
          inputMode="decimal"
          placeholder="0,00 €"
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
        />

        <label style={styles.fieldLabel}>Compte par défaut</label>
        {accounts.length === 0 ? (
          <p style={styles.emptyText}>Aucun compte créé.</p>
        ) : (
          <div style={styles.accountPicker}>
            {accounts.map((a) => (
              <button
                key={a.id}
                onClick={() => setDefaultAccountId(a.id)}
                style={{
                  ...styles.accountChip,
                  borderColor: defaultAccountId === a.id ? a.color : "transparent",
                  background: defaultAccountId === a.id ? `${a.color}33` : "#1C2333",
                }}
              >
                <span style={{ ...styles.accountChipDot, background: a.color }} />
                {a.name}
              </button>
            ))}
          </div>
        )}

        <div style={styles.modalActions}>
          <button style={styles.cancelBtn} onClick={onClose}>
            Annuler
          </button>
          <button style={styles.confirmBtn} onClick={submit}>
            Créer
          </button>
        </div>
      </div>
    </div>
  );
}

const fontImports = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap');
`;

const styles = {
  app: {
    minHeight: "100vh",
    width: "100%",
    maxWidth: 480,
    margin: "0 auto",
    background: "#1C2333",
    fontFamily: "'Inter', sans-serif",
    color: "#E8DFC8",
    position: "relative",
    paddingBottom: 100,
    overflowX: "hidden",
    boxSizing: "border-box",
  },
  loadingScreen: {
    minHeight: "100vh",
    background: "#1C2333",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#8A7F9E",
    fontFamily: "'Inter', sans-serif",
  },
  loadingPulse: {
    animation: "pulse 1.5s ease-in-out infinite",
  },
  header: {
    padding: "28px 24px 24px",
    background: "linear-gradient(180deg, #232B42 0%, #1C2333 100%)",
    borderBottom: "1px solid #2E3650",
  },
  headerTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  headerTopLeft: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  accountsBtn: {
    background: "#2E3650",
    border: "none",
    borderRadius: 999,
    padding: "6px 12px",
    color: "#E8DFC8",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  headerActionsRow: {
    display: "flex",
    gap: 8,
    marginTop: 14,
  },
  headerActionBtn: {
    flex: 1,
    background: "#2E3650",
    border: "none",
    borderRadius: 10,
    padding: "9px 10px",
    color: "#E8DFC8",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  headerLabel: {
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "#A79FBB",
  },
  balanceRow: {
    marginBottom: 8,
  },
  balanceNumber: {
    fontFamily: "'Fraunces', serif",
    fontSize: 44,
    fontWeight: 500,
    letterSpacing: "-0.02em",
    lineHeight: 1,
  },
  subRow: {
    display: "flex",
    gap: 16,
  },
  subStat: {
    fontSize: 13,
    color: "#B8AFCB",
  },
  main: {
    padding: "20px 20px 0",
  },
  sectionHeadRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    marginTop: 8,
  },
  sectionHead: {
    fontSize: 15,
    fontWeight: 600,
    color: "#E8DFC8",
    margin: 0,
  },
  iconBtnSmall: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    background: "#2E3650",
    border: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
  emptyText: {
    color: "#6B6480",
    fontSize: 14,
    padding: "8px 0 16px",
  },
  forecastCard: {
    background: "#252D42",
    borderRadius: 16,
    padding: "18px 18px 14px",
    border: "1px solid #2E3650",
    marginBottom: 28,
  },
  forecastMain: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    marginBottom: 10,
  },
  forecastLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "#A79FBB",
  },
  forecastNumber: {
    fontFamily: "'Fraunces', serif",
    fontSize: 32,
    fontWeight: 500,
    letterSpacing: "-0.01em",
    lineHeight: 1.1,
  },
  forecastBreakdown: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    marginBottom: 4,
  },
  forecastLine: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 13,
  },
  forecastLineLabel: {
    color: "#A79FBB",
  },
  forecastLineValue: {
    fontWeight: 600,
  },
  recurringList: {
    display: "flex",
    flexDirection: "column",
    marginTop: 10,
    borderTop: "1px solid #2E3650",
    paddingTop: 6,
  },
  recurringRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 0",
  },
  recurringName: {
    fontSize: 13,
    color: "#E8DFC8",
    flex: 1,
  },
  budgetList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    marginBottom: 28,
  },
  budgetCard: {
    background: "#252D42",
    borderRadius: 16,
    padding: "14px 16px",
    border: "1px solid #2E3650",
  },
  budgetTopRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  budgetName: {
    fontSize: 14,
    fontWeight: 600,
    color: "#E8DFC8",
  },
  deleteBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 4,
    display: "flex",
  },
  barTrack: {
    position: "relative",
    height: 30,
    background: "#1C2333",
    borderRadius: 999,
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
  },
  barFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    transition: "width 0.4s ease",
  },
  barLabel: {
    position: "relative",
    fontSize: 12,
    fontWeight: 600,
    color: "#E8DFC8",
    paddingLeft: 12,
    zIndex: 1,
    mixBlendMode: "difference",
  },
  budgetMeta: {
    fontSize: 11,
    color: "#6B6480",
    marginTop: 6,
    textAlign: "right",
  },
  transferBtn: {
    width: "100%",
    marginTop: 16,
    marginBottom: 4,
    padding: "12px 0",
    borderRadius: 10,
    border: "1px solid #2E3650",
    background: "#1C2333",
    color: "#8FA3C4",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
  },
  transferPreview: {
    fontSize: 12,
    color: "#A79FBB",
    lineHeight: 1.6,
    marginTop: 14,
    padding: "10px 12px",
    background: "#1C2333",
    borderRadius: 10,
  },
  transferError: {
    fontSize: 12,
    color: "#E08E7D",
    marginTop: 6,
  },
  txList: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  txRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 4px",
    borderBottom: "1px solid #252D42",
  },
  txDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    flexShrink: 0,
  },
  txInfo: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minWidth: 0,
  },
  txNote: {
    fontSize: 14,
    color: "#E8DFC8",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  txDate: {
    fontSize: 11,
    color: "#6B6480",
  },
  txAmount: {
    fontSize: 14,
    fontWeight: 600,
    flexShrink: 0,
  },
  txDelete: {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 4,
    flexShrink: 0,
  },
  fab: {
    position: "fixed",
    bottom: 28,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: "50%",
    background: "#E8DFC8",
    border: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
  },
  errorBanner: {
    position: "fixed",
    bottom: 100,
    left: 20,
    right: 20,
    maxWidth: 440,
    margin: "0 auto",
    background: "#D96C5C",
    color: "#1C2333",
    padding: "10px 16px",
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 600,
    textAlign: "center",
  },
  legacyBanner: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "#2E3650",
    color: "#E8DFC8",
    padding: "10px 16px",
    fontSize: 13,
    margin: "0 20px 16px",
    borderRadius: 10,
  },
  legacyImportBtn: {
    background: "#E8DFC8",
    color: "#1C2333",
    border: "none",
    borderRadius: 8,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    flexShrink: 0,
  },
  legacyDismissBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    marginLeft: "auto",
    flexShrink: 0,
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(10,12,20,0.6)",
    display: "flex",
    alignItems: "flex-end",
    zIndex: 100,
  },
  modalSheet: {
    background: "#232B42",
    width: "100%",
    maxWidth: 480,
    margin: "0 auto",
    borderRadius: "20px 20px 0 0",
    padding: "12px 20px 28px",
    display: "flex",
    flexDirection: "column",
    maxHeight: "75vh",
    overflowY: "auto",
    boxSizing: "border-box",
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    background: "#3B4560",
    margin: "0 auto 16px",
  },
  modalTitle: {
    fontFamily: "'Fraunces', serif",
    fontSize: 22,
    fontWeight: 500,
    margin: "0 0 20px",
    color: "#E8DFC8",
  },
  typeToggle: {
    display: "flex",
    gap: 8,
    marginBottom: 18,
  },
  typeBtn: {
    flex: 1,
    padding: "10px 0",
    borderRadius: 10,
    border: "1px solid #2E3650",
    background: "#1C2333",
    color: "#8A7F9E",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
  },
  typeBtnActiveExpense: {
    background: "#D96C5C22",
    borderColor: "#D96C5C",
    color: "#E8A798",
  },
  typeBtnActiveIncome: {
    background: "#5C8B6E22",
    borderColor: "#5C8B6E",
    color: "#8FBF9F",
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "#A79FBB",
    marginBottom: 6,
    marginTop: 14,
    display: "block",
  },
  input: {
    width: "100%",
    background: "#1C2333",
    border: "1px solid #2E3650",
    borderRadius: 10,
    padding: "12px 14px",
    color: "#E8DFC8",
    fontSize: 15,
    fontFamily: "'Inter', sans-serif",
    boxSizing: "border-box",
    outline: "none",
  },
  catPicker: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  catChip: {
    padding: "8px 14px",
    borderRadius: 999,
    border: "1.5px solid transparent",
    fontSize: 13,
    fontWeight: 600,
    color: "#E8DFC8",
    cursor: "pointer",
  },
  accountPicker: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  accountChip: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    padding: "8px 14px",
    borderRadius: 999,
    border: "1.5px solid transparent",
    fontSize: 13,
    fontWeight: 600,
    color: "#E8DFC8",
    cursor: "pointer",
  },
  accountChipDot: {
    width: 9,
    height: 9,
    borderRadius: "50%",
    flexShrink: 0,
    display: "inline-block",
  },
  accountsViewList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    marginBottom: 8,
  },
  accountCard: {
    background: "#1C2333",
    borderRadius: 16,
    padding: "14px 16px",
    border: "1px solid #2E3650",
  },
  accountCardName: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 14,
    fontWeight: 600,
    color: "#E8DFC8",
  },
  accountIncomeLine: {
    fontSize: 12,
    color: "#A79FBB",
    marginBottom: 10,
  },
  accountCatList: {
    display: "flex",
    flexDirection: "column",
    marginTop: 10,
    paddingTop: 8,
    borderTop: "1px solid #2E3650",
    gap: 6,
  },
  accountCatRow: {
    display: "flex",
    justifyContent: "space-between",
  },
  accountCatName: {
    fontSize: 12,
    color: "#E8DFC8",
  },
  accountCatValue: {
    fontSize: 12,
    fontWeight: 600,
  },
  editBudgetBtn: {
    background: "none",
    border: "none",
    color: "#A79FBB",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    padding: 4,
  },
  editBudgetRow: {
    display: "flex",
    gap: 8,
    alignItems: "center",
  },
  confirmBtnSmall: {
    padding: "12px 16px",
    borderRadius: 10,
    border: "none",
    background: "#E8DFC8",
    color: "#1C2333",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    flexShrink: 0,
  },
  colorPicker: {
    display: "flex",
    gap: 12,
  },
  colorDot: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    border: "none",
    cursor: "pointer",
  },
  modalActions: {
    display: "flex",
    gap: 10,
    marginTop: 24,
    position: "sticky",
    bottom: 0,
    background: "#232B42",
    paddingTop: 8,
    paddingBottom: 4,
  },
  cancelBtn: {
    flex: 1,
    padding: "13px 0",
    borderRadius: 10,
    border: "1px solid #2E3650",
    background: "transparent",
    color: "#A79FBB",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
  },
  confirmBtn: {
    flex: 2,
    padding: "13px 0",
    borderRadius: 10,
    border: "none",
    background: "#E8DFC8",
    color: "#1C2333",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
  },
  confirmBtnDisabled: {
    background: "#4A5270",
    color: "#8A7F9E",
    cursor: "not-allowed",
  },
  deleteConfirmBtn: {
    flex: 2,
    padding: "13px 0",
    borderRadius: 10,
    border: "none",
    background: "#D96C5C",
    color: "#1C2333",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
  },
};
