"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type BookingStatus = "CONFIRMED" | "CANCELLED";

export default function CancelButton({
    reference,
    initialStatus,
}: {
    reference: string;
    initialStatus?: BookingStatus;
}) {
    const router = useRouter();

    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<BookingStatus | null>(initialStatus ?? null);
    const [checking, setChecking] = useState(initialStatus ? false : true);

    // If parent didn't give us status, fetch it so we can disable if cancelled
    useEffect(() => {
        if (status) return;

        async function checkStatus() {
            try {
                setChecking(true);
                const res = await fetch(`/api/bookings/${reference}`);
                const data = await res.json();

                if (res.ok && data?.ok && data?.booking?.status) {
                    setStatus(data.booking.status as BookingStatus);
                }
            } finally {
                setChecking(false);
            }
        }

        checkStatus();
    }, [reference, status]);

    async function onCancel() {
        if (status === "CANCELLED") {
            alert("This booking is already cancelled.");
            router.push(`/book/cancelled?ref=${reference}`);
            return;
        }

        const ok = confirm("Are you sure you want to cancel this booking?");
        if (!ok) return;

        setLoading(true);

        try {
            const res = await fetch(`/api/bookings/${reference}/cancel`, {
                method: "POST",
            });

            const data = await res.json();

            if (!res.ok) {
                // If backend says already cancelled, treat as cancelled UX
                if ((data?.error ?? "").toLowerCase().includes("already cancelled")) {
                    setStatus("CANCELLED");
                    router.push(`/book/cancelled?ref=${reference}`);
                    return;
                }

                alert(data.error ?? "Something went wrong");
                return;
            }

            // Mark cancelled locally and redirect to the cancelled confirmation page
            setStatus("CANCELLED");
            router.push(`/book/cancelled?ref=${reference}`);
        } finally {
            setLoading(false);
        }
    }

    const isCancelled = status === "CANCELLED";
    const disabled = loading || checking || isCancelled;

    return (
        <button
            onClick={onCancel}
            disabled={disabled}
            className={
                "inline-flex w-1/2 items-center justify-center rounded-md px-4 py-3 font-semibold disabled:opacity-60 " +
                (isCancelled
                    ? "bg-black/5 text-black/40 cursor-not-allowed"
                    : "bg-[#6b0f13] text-white hover:opacity-95")
            }
            type="button"
            title={isCancelled ? "This booking is already cancelled." : "Cancel booking"}
        >
            {loading ? "Cancelling..." : isCancelled ? "Cancelled" : "Cancel booking"}
        </button>
    );

}
