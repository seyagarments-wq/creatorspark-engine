import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Package,
  Search,
  Truck,
  CheckCircle,
  Clock,
  XCircle,
  MoreHorizontal,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SampleRequest {
  id: string;
  product_name: string;
  product_description: string | null;
  shipping_address: string;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_zip: string | null;
  status: string;
  tracking_number: string | null;
  admin_notes: string | null;
  created_at: string;
  shipped_at: string | null;
  delivered_at: string | null;
  shopify_product_id: string | null;
  shopify_variant_id: string | null;
  shopify_product_title: string | null;
  shopify_variant_title: string | null;
  shopify_product_image: string | null;
  shopify_draft_order_id: string | null;
  creator: {
    id: string;
    full_name: string;
    email: string;
  } | null;
  brand: {
    id: string;
    name: string;
  } | null;
}

export default function AdminSamples() {
  const { toast } = useToast();
  const [requests, setRequests] = useState<SampleRequest[]>([]);
  const [filteredRequests, setFilteredRequests] = useState<SampleRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  
  // Shipping dialog state
  const [shipDialogOpen, setShipDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<SampleRequest | null>(null);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // Reject dialog state
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  useEffect(() => {
    fetchRequests();
  }, []);

  useEffect(() => {
    filterRequests();
  }, [requests, searchQuery, statusFilter]);

  async function fetchRequests() {
    try {
      const { data, error } = await supabase
        .from("sample_requests")
        .select(`
          *,
          creator:profiles(id, full_name, email),
          brand:brands(id, name)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (error) {
      console.error("Error fetching requests:", error);
    } finally {
      setLoading(false);
    }
  }

  function filterRequests() {
    let filtered = [...requests];

    if (statusFilter !== "all") {
      filtered = filtered.filter(r => r.status === statusFilter);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(r =>
        r.product_name.toLowerCase().includes(query) ||
        r.creator?.full_name.toLowerCase().includes(query) ||
        r.creator?.email.toLowerCase().includes(query) ||
        r.brand?.name.toLowerCase().includes(query)
      );
    }

    setFilteredRequests(filtered);
  }

  async function updateStatus(id: string, status: string, additionalData?: Record<string, any>) {
    setActionLoading(true);
    try {
      const updateData: Record<string, any> = { status, ...additionalData };
      
      if (status === "shipped" && !updateData.shipped_at) {
        updateData.shipped_at = new Date().toISOString();
      }
      if (status === "delivered" && !updateData.delivered_at) {
        updateData.delivered_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("sample_requests")
        .update(updateData)
        .eq("id", id);

      if (error) throw error;

      // Send notification for status changes
      const request = requests.find((r) => r.id === id);
      if (request?.creator) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("id", request.creator.id)
          .maybeSingle();

        if (profile?.user_id) {
          let notifTitle = "";
          let notifMsg = "";

          switch (status) {
            case "approved":
              notifTitle = "Sample request approved";
              notifMsg = `Your request for "${request.product_name}" has been approved. Shipping details will follow shortly. Begin planning your content now so you are ready to film once it arrives.`;
              break;
            case "rejected":
              notifTitle = "[Important] Sample request not approved";
              notifMsg = `Your request for "${request.product_name}" was not approved.${additionalData?.rejection_reason ? `\n\nReason: ${additionalData.rejection_reason}` : ""}\n\nIf you have questions, reach out in chat.`;
              break;
            case "shipped":
              notifTitle = "Sample shipped";
              notifMsg = `Your "${request.product_name}" sample has shipped.${additionalData?.tracking_number ? `\n\nTracking number: ${additionalData.tracking_number}` : ""}\n\nUse the time before delivery to plan your concepts so you can begin filming as soon as it arrives.`;
              break;
            case "delivered":
              notifTitle = "Sample delivered";
              notifMsg = `Your "${request.product_name}" sample has been delivered. Begin filming. Reminder: a minimum of one upload per week is required to remain active.`;
              break;
            case "cancelled":
              notifTitle = "Sample request cancelled";
              notifMsg = `Your request for "${request.product_name}" has been cancelled.`;
              break;
          }

          if (notifTitle) {
            const isShipped = status === "shipped";
            const trackingLink = isShipped && additionalData?.tracking_number
              ? `https://seyagarments.com/apps/track123?tracking_number=${encodeURIComponent(additionalData.tracking_number)}`
              : null;

            await supabase.functions.invoke("send-notification-email", {
              body: {
                user_id: profile.user_id,
                title: notifTitle,
                message: notifMsg,
                notification_type: "general",
                link: trackingLink || "/creator/samples",
                button_text: isShipped ? "Track Your Package" : (status === "delivered" ? "Start Creating" : undefined),
              },
            });
          }
        }
      }

      toast({ title: `Request ${status}` });
      fetchRequests();
      setShipDialogOpen(false);
      setRejectDialogOpen(false);
      setSelectedRequest(null);
      setTrackingNumber("");
      setAdminNotes("");
      setRejectionReason("");
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  }

  async function approveWithShopifyOrder(request: SampleRequest) {
    if (!request.shopify_variant_id) {
      // No Shopify product selected - just approve normally
      updateStatus(request.id, "approved");
      return;
    }

    setActionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "shopify-create-sample-order",
        {
          body: { sampleRequestId: request.id },
        }
      );

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      // Approval notification is sent server-side from shopify-create-sample-order
      // for reliability, so no client-side notification call is needed here.

      toast({
        title: "Draft order created!",
        description: `Shopify draft order #${data.draftOrderId} created successfully`,
      });
      fetchRequests();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to create Shopify order";
      toast({
        title: "Error creating Shopify order",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  }

  function handleRejectRequest() {
    if (!selectedRequest) return;
    updateStatus(selectedRequest.id, "rejected", {
      rejection_reason: rejectionReason.trim() || null,
    });
  }

  function handleShipRequest() {
    if (!selectedRequest) return;
    updateStatus(selectedRequest.id, "shipped", {
      tracking_number: trackingNumber.trim() || null,
      admin_notes: adminNotes.trim() || null,
    });
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "requested":
        return <Badge variant="outline" className="gap-1"><Clock className="w-3 h-3" /> Pending</Badge>;
      case "approved":
        return <Badge className="bg-info/10 text-info gap-1"><CheckCircle className="w-3 h-3" /> Approved</Badge>;
      case "shipped":
        return <Badge className="bg-warning/10 text-warning gap-1"><Truck className="w-3 h-3" /> Shipped</Badge>;
      case "delivered":
        return <Badge className="bg-success/10 text-success gap-1"><CheckCircle className="w-3 h-3" /> Delivered</Badge>;
      case "rejected":
        return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" /> Rejected</Badge>;
      case "cancelled":
        return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" /> Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  }

  function formatDate(date: string) {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }

  function formatAddress(request: SampleRequest) {
    const parts = [
      request.shipping_address,
      request.shipping_city,
      request.shipping_state,
      request.shipping_zip,
    ].filter(Boolean);
    return parts.join(", ");
  }

  const stats = {
    total: requests.length,
    pending: requests.filter(r => r.status === "requested").length,
    approved: requests.filter(r => r.status === "approved").length,
    shipped: requests.filter(r => r.status === "shipped").length,
    delivered: requests.filter(r => r.status === "delivered").length,
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid gap-4 md:grid-cols-5">
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-24" />)}
          </div>
          <Skeleton className="h-64" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Sample Requests</h1>
          <p className="text-sm text-muted-foreground">Manage product sample fulfillment</p>
        </div>

        {/* Stats */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
          <div className="stat-card">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-primary/10">
                <Package className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-sm text-muted-foreground">Total</p>
              </div>
            </div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-warning/10">
                <Clock className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.pending}</p>
                <p className="text-sm text-muted-foreground">Pending</p>
              </div>
            </div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-info/10">
                <CheckCircle className="w-5 h-5 text-info" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.approved}</p>
                <p className="text-sm text-muted-foreground">Approved</p>
              </div>
            </div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-accent/10">
                <Truck className="w-5 h-5 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.shipped}</p>
                <p className="text-sm text-muted-foreground">Shipped</p>
              </div>
            </div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-success/10">
                <CheckCircle className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.delivered}</p>
                <p className="text-sm text-muted-foreground">Delivered</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search requests..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="requested">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="shipped">Shipped</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {filteredRequests.length === 0 ? (
          <div className="stat-card text-center py-12">
            <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-medium mb-2">No requests found</h3>
            <p className="text-sm text-muted-foreground">
              {requests.length === 0
                ? "No sample requests have been submitted yet"
                : "Try adjusting your filters"}
            </p>
          </div>
        ) : (
          <>
            {/* Mobile Card View */}
            <div className="md:hidden space-y-3">
              {filteredRequests.map((request) => (
                <div key={request.id} className="border rounded-lg p-3 bg-card space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      {request.shopify_product_image && (
                        <img src={request.shopify_product_image} alt="" className="w-10 h-10 object-cover rounded" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{request.product_name}</p>
                        <p className="text-xs text-muted-foreground truncate">{request.creator?.full_name}</p>
                      </div>
                    </div>
                    {getStatusBadge(request.status)}
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t">
                    <span>{request.brand?.name || "-"}</span>
                    <div className="flex items-center gap-2">
                      <span>{formatDate(request.created_at)}</span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {request.status === "requested" && (
                            <>
                              <DropdownMenuItem onClick={() => approveWithShopifyOrder(request)} disabled={actionLoading}>
                                <CheckCircle className="w-4 h-4 mr-2" />
                                {request.shopify_variant_id ? "Approve & Order" : "Approve"}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { setSelectedRequest(request); setRejectionReason(""); setRejectDialogOpen(true); }}>
                                <XCircle className="w-4 h-4 mr-2" /> Reject
                              </DropdownMenuItem>
                            </>
                          )}
                          {request.status === "approved" && (
                            <DropdownMenuItem onClick={() => { setSelectedRequest(request); setShipDialogOpen(true); }}>
                              <Truck className="w-4 h-4 mr-2" /> Ship
                            </DropdownMenuItem>
                          )}
                          {request.status === "shipped" && (
                            <DropdownMenuItem onClick={() => updateStatus(request.id, "delivered")}>
                              <CheckCircle className="w-4 h-4 mr-2" /> Delivered
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="stat-card overflow-x-auto hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Creator</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRequests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{request.creator?.full_name}</p>
                          <p className="text-xs text-muted-foreground">{request.creator?.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {request.shopify_product_image && (
                            <img src={request.shopify_product_image} alt={request.product_name} className="w-10 h-10 object-cover rounded" />
                          )}
                          <div>
                            <p className="font-medium">{request.product_name}</p>
                            {request.shopify_variant_title && request.shopify_variant_title !== "Default Title" && (
                              <p className="text-xs text-muted-foreground truncate max-w-[200px]">{request.shopify_variant_title}</p>
                            )}
                            {request.shopify_draft_order_id && (
                              <p className="text-xs text-success">Draft Order: #{request.shopify_draft_order_id}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{request.brand?.name || "-"}</TableCell>
                      <TableCell>
                        <p className="text-sm truncate max-w-[200px]">{formatAddress(request)}</p>
                      </TableCell>
                      <TableCell>{getStatusBadge(request.status)}</TableCell>
                      <TableCell>{formatDate(request.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon"><MoreHorizontal className="w-4 h-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {request.status === "requested" && (
                              <>
                                <DropdownMenuItem onClick={() => approveWithShopifyOrder(request)} disabled={actionLoading}>
                                  <CheckCircle className="w-4 h-4 mr-2" />
                                  {request.shopify_variant_id ? "Approve & Create Order" : "Approve"}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => { setSelectedRequest(request); setRejectionReason(""); setRejectDialogOpen(true); }}>
                                  <XCircle className="w-4 h-4 mr-2" /> Reject
                                </DropdownMenuItem>
                              </>
                            )}
                            {request.status === "approved" && (
                              <DropdownMenuItem onClick={() => { setSelectedRequest(request); setShipDialogOpen(true); }}>
                                <Truck className="w-4 h-4 mr-2" /> Mark as Shipped
                              </DropdownMenuItem>
                            )}
                            {request.status === "shipped" && (
                              <DropdownMenuItem onClick={() => updateStatus(request.id, "delivered")}>
                                <CheckCircle className="w-4 h-4 mr-2" /> Mark as Delivered
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>

      {/* Ship Dialog */}
      <Dialog open={shipDialogOpen} onOpenChange={setShipDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Shipped</DialogTitle>
            <DialogDescription>
              Add tracking information for {selectedRequest?.product_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Tracking Number</Label>
              <Input
                placeholder="e.g., 1Z999AA10123456784"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes (Optional)</Label>
              <Textarea
                placeholder="Any notes about the shipment..."
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShipDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="success"
              onClick={handleShipRequest}
              disabled={actionLoading}
            >
              <Truck className="w-4 h-4 mr-2" />
              Mark as Shipped
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Sample Request</DialogTitle>
            <DialogDescription>
              Reject the request for {selectedRequest?.product_name} from {selectedRequest?.creator?.full_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Reason for Rejection</Label>
              <Textarea
                placeholder="e.g., Already received this product, not eligible for samples yet, etc."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectRequest}
              disabled={actionLoading}
            >
              <XCircle className="w-4 h-4 mr-2" />
              Reject Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
