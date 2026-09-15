# Invoice customers

The admin pages behind the buyers a municipality club's invoice is addressed to: the list,
the form that creates or edits one, and the picker a club's own form uses to name one.

## What an invoice customer is

**It is a contract party in Fennoa, our accounting system — not a place and not an
organisation we model.** It carries exactly what raising an invoice needs: the Fennoa
customer number, the name the invoice must be addressed to, a postal address, and two
optional fields a buyer may have asked for — their own reference, and standing text they
want on every invoice. Nothing else about the buyer is stored here, because nothing else
about the buyer is ours to know.

**The customer number is the join key, and it is the whole point of the record.** Fennoa
matches an imported invoice to a customer on that number; an identifier it does not
recognise does not fail the import, it **creates a customer**, and nobody notices until one
municipality has two cards. So the number is unique, it is the field the form leads with,
and the hint beside it says where to copy it from.

**The postal address is stored even though the Fennoa customer card already holds one**,
because the import refuses a file that does not state it. What is deliberately *not* stored
is everything Fennoa applies when it sends: payment terms, e-invoice routing, department
names. Those belong to the accounting system, and a second copy here would be a copy that
goes stale.

## Why the link is per club, and never per location

**One city can be two customers, and one customer can buy clubs in a city it is not.** A
municipality that runs library clubs under one department's agreement and school clubs
under another's is two buyers; an association that funds clubs meeting inside a
municipality it has no part in is a third shape again. So nothing may derive the buyer from
where a club meets: which municipality a club sits in decides the section it is invoiced
under, and which customer it names decides the file it ends up in, and the two questions
are genuinely independent.

**This data never references the locations table.** Location data is geography and has to
keep working for every country we ever operate in; a customer's billing address, its number
and its invoice name are contract data about one country's arrangements. Coupling them
would make a national billing arrangement a property of the world map, and the first site
outside that country would carry columns that mean nothing. The only edge between the two
systems is the club, which points at a place and at a buyer independently.

**A club's customer is optional at creation and reported at invoicing**, exactly like its
fee. A club is created before anybody has agreed who pays for it, so a constraint here
would stop an admin saving a club at all; the gap is flagged where it costs something,
which is the invoicing ledger (`../municipality-invoicing/`), and the club's own page is
the repair.

## The write path

**There is no API route in this feature, and that is a decision rather than an omission.**
Neither write needs a server-side secret, so both go straight from the admin's own session
client to a role-gated `SECURITY DEFINER` function, and the read is a plain table read under
the table's admin-only select policy. The table itself carries **no write grant at all**, so
a stray insert from anywhere fails closed rather than landing — the functions are the only
way in, and their guards are the authorization.

**The form's schema and the table's constraints say the same things, on purpose.** The
schema is the sentence the admin reads when a field is wrong; the constraint is the
guarantee that holds whatever route a row arrives by. Both trim, both refuse a blank, and
an emptied optional field becomes a real null rather than travelling as an empty string —
"no reference" is one state, and the column refuses the other spelling of it.

**Every field is required on the wire, including the two nullable ones.** The update
function assigns every editable column on every call, so an omitted field would clear a
reference nobody asked to clear; demanding the field is what makes clearing it a deliberate
null.

**The list is walked rather than read in one request.** It is a few dozen rows today and
that is a fact about current data rather than a property of the query — the table only
grows, and a truncated read would quietly stop offering the customers that fell off the
end, on a picker whose whole job is to offer all of them.

## The pages

**One customer's page *is* its edit form.** There is no read-only detail page between the
list and the form: a customer is eight fields, and the list already shows the ones that
tell two apart. The list is the number, the billing name, the city and whether a reference
is set — enough to find the right buyer, and not a second rendering of the form.

**The picker on a club names the customer and the number together**, because two
departments of one city can share a billing name and the number is the only thing that
tells them apart. It links out to this list rather than offering to create a customer
inline: a buyer is a contract party somebody agreed to, and agreeing to one in the middle of
saving a club is not a thing that happens.
